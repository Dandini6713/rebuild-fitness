-- Roadmap 14: the trusted, server-enforced path for starting a scheduled session.
--
-- docs/06 §6.5 makes "a red readiness result cancels or replaces the affected
-- session" a HARD rule, and docs/07 §7.4 forbids a red result from being overridable.
-- Enforcing that on the client alone is not enough: a client whose own check is
-- bypassed could still write the in_progress workout_logs row and start the session.
-- So — exactly as roadmap 13 did for readiness inserts — the enforcement lives in the
-- database, and the client is given no way around it.
--
-- Two parts:
--
--   1. start_scheduled_session, a SECURITY DEFINER function that is the ONLY way to
--      create a workout_logs row. It captures auth.uid(), loads the caller's own
--      scheduled session, decides whether that session is gated (running or demanding
--      lower-body — mirroring classifySession in domain/training/schedulingRules.ts),
--      reads the most recent PRE-SESSION readiness check for that session, and, when
--      the latest pre-session classification is red AND the session is gated, RAISES
--      rather than inserting. The row is never created. Otherwise it inserts the
--      in_progress row exactly as the client used to, and returns its id.
--
--   2. A REVOKE of INSERT on workout_logs from the authenticated role, so the only
--      remaining writer of a starting row is this definer function. This is what makes
--      the block unbypassable: with no INSERT grant, a client cannot create the row
--      directly even if it skips its own UI check. SELECT / UPDATE / DELETE are left
--      as they are — the workout player still updates its own log to complete it, and
--      completing a session is not starting one, so it is deliberately not gated here.
--
-- Enforcement semantics (all asserted in supabase/tests/start_scheduled_session.test.sql):
--   - Only the LATEST pre-session check for the session counts. A later non-red check
--     clears an earlier red (the user rechecked and improved).
--   - Green and amber both PERMIT the start. Amber warns and offers a gentler option
--     (the activity swap is roadmap 15); it does not block. Only red blocks.
--   - No pre-session check at all PERMITS the start. A session cannot be gated behind a
--     check the user was never prompted to complete. (Roadmap 14 does not force a
--     pre-session check before every session; that prompting flow is a documented seam.)
--   - The block applies ONLY to running and demanding-lower-body (strength) sessions.
--     Cardio, rest and Achilles-day sessions are never blocked by a red result.
--
-- Hardening, following submit_readiness_checkin and seed_private_plan: set search_path
-- = '' and schema-qualify every reference, and grant execute to authenticated only,
-- never anon. The explicit auth.uid() check plus the user_id = auth.uid() write keep
-- every row owner-scoped exactly as row-level security would, even though the definer
-- function runs with RLS bypassed.
--
-- The red-block failure carries a stable marker ('readiness-red-block') in its message
-- so the client can map it to the honest red result screen (docs/07 §7.2 professional
-- care) instead of treating it as a generic connection error. There is no way for a
-- caller to smuggle in a "start anyway": the function takes only the session id and a
-- timestamp.

create or replace function public.start_scheduled_session(
  p_scheduled_session_id uuid,
  p_started_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_session_type text;
  v_is_gated boolean;
  v_latest_classification public.readiness_classification;
  v_log_id uuid;
begin
  if v_user_id is null then
    raise exception 'start_scheduled_session requires an authenticated user'
      using errcode = '28000';
  end if;

  -- The caller's own scheduled session. RLS is bypassed under SECURITY DEFINER, so we
  -- scope explicitly by user_id, exactly as submit_readiness_checkin does on insert.
  select scheduled_sessions.session_type
    into v_session_type
    from public.scheduled_sessions
   where scheduled_sessions.id = p_scheduled_session_id
     and scheduled_sessions.user_id = v_user_id;

  if v_session_type is null then
    raise exception 'scheduled session not found for this user'
      using errcode = 'P0002';
  end if;

  -- Which sessions a red readiness result blocks (docs/06 §6.5): running and demanding
  -- lower-body. This mirrors classifySession in schedulingRules.ts — in the current
  -- plan a strength session IS a demanding lower-body session (both seeded persona
  -- templates are compound, lower-body-heavy). Cardio / rest / achilles are recovery
  -- or low-impact and are never gated. If a future template adds an upper-body-only
  -- strength day, this list needs the same template-level flag the classifier does;
  -- that is the shared seam.
  v_is_gated := v_session_type in ('running', 'strength');

  if v_is_gated then
    -- The single most recent PRE-SESSION readiness check for this session. Only the
    -- latest counts, so a later non-red check clears an earlier red. No pre-session
    -- check leaves this null, which permits the start.
    select readiness_checkins.classification
      into v_latest_classification
      from public.readiness_checkins
     where readiness_checkins.scheduled_session_id = p_scheduled_session_id
       and readiness_checkins.user_id = v_user_id
       and readiness_checkins.checkin_type = 'pre_session'
     order by readiness_checkins.created_at desc
     limit 1;

    if v_latest_classification = 'red' then
      -- docs/06 §6.5 hard rule and docs/07 §7.4 (a red result must not be
      -- overridable): refuse to create the row at all. The 'readiness-red-block'
      -- marker lets the client render the red result rather than a connection error.
      raise exception
        'readiness-red-block: the latest pre-session readiness result for this session is red, so it cannot be started'
        using errcode = 'P0001';
    end if;
  end if;

  insert into public.workout_logs (
    user_id,
    scheduled_session_id,
    started_at,
    status
  ) values (
    v_user_id,
    p_scheduled_session_id,
    p_started_at,
    'in_progress'
  )
  returning workout_logs.id into v_log_id;

  return v_log_id;
end;
$$;

-- Only signed-in users may start a session, and never the anonymous role.
revoke all on function public.start_scheduled_session(uuid, timestamptz)
  from public, anon;
grant execute on function public.start_scheduled_session(uuid, timestamptz)
  to authenticated;

-- Make start_scheduled_session the SOLE writer of a starting workout_logs row. Without
-- this revoke a client could bypass the readiness block by inserting the in_progress
-- row directly under its owner RLS policy. SELECT / UPDATE / DELETE remain granted:
-- the player still reads and updates its own log (including marking it completed, which
-- is not a start), and owner isolation is unchanged. The 20260711090500 combined grant
-- gave INSERT here; this forward migration withdraws only that one privilege.
revoke insert on table public.workout_logs from authenticated;
