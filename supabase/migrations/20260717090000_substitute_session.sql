-- Roadmap 15: the trusted, atomic write path for an AMBER activity substitution
-- (docs/06 §6.2).
--
-- After an amber readiness result the guidance is to replace a run with flat
-- walking, easy cycling, the cross-trainer or rest, and not to progress the running
-- week. This is the amber SWAP; roadmap 14 built the red BLOCK. The two are different
-- in kind: the red block is a safety gate that must be server-ENFORCED and
-- unbypassable (a SECURITY DEFINER function plus a revoked INSERT grant, docs/07 §7.4),
-- whereas the amber swap is an action the user opts INTO. It needs no privilege
-- escalation — the user owns every row involved and ordinary row-level security is
-- exactly the right guard — so this is a SECURITY INVOKER function (like
-- seed_private_plan), NOT a definer one.
--
-- What it does still needs a transaction, though, because "substitute" here is a
-- LINKED replacement, not an in-place edit (that is what the weekly planner's
-- replaceScheduledSession does, and it is deliberately not reused):
--
--   1. The ORIGINAL scheduled_sessions row is PRESERVED and marked status
--      'replaced'. It is the audit trail and the record of what was originally
--      planned; it is never edited away.
--   2. A NEW scheduled_sessions row is inserted for the SAME scheduled_date and
--      plan_week_id, with replacement_for_id pointing back to the original, source
--      'user', reschedule_reason recording why (the amber result and the chosen
--      alternative), the substituted session_type, and status 'planned'. This is
--      exactly what replacement_for_id and the 'replaced' status were added for in
--      20260711090200 and were, until now, unused.
--
-- Both writes happen in ONE transaction (the whole function body). It is
-- all-or-nothing: a failure leaves the original untouched, so a client can never
-- half-fail and orphan a 'replaced' session with no replacement. That atomicity is
-- the reason it is a function at all rather than two separate client calls.
--
-- Idempotency / guard against a second replacement. The original is locked FOR
-- UPDATE and must still be 'planned'. Substituting a session that is already
-- 'replaced' (or completed, in progress, skipped or cancelled) fails cleanly with a
-- clear message and creates no second row — the FOR UPDATE also serialises two
-- concurrent calls so only the first can win.
--
-- Cardio-activity-typing seam. The base plan types all low-impact cardio as a single
-- 'cardio' session_type (the roadmap 09 seam — walks, bikes and run-walks are one
-- undifferentiated bucket). Distinct cardio activity types arrive with the cardio
-- player (roadmap 16). So a walk / bike / cross-trainer substitution creates a
-- 'cardio'-typed replacement and records the SPECIFIC chosen activity in
-- reschedule_reason; a rest substitution creates a 'rest'-typed replacement. This
-- function therefore accepts only 'cardio' or 'rest' as the new type and does not
-- invent walking/bike/cross-trainer types. When roadmap 16 introduces distinct cardio
-- activity types the replacement's type simply becomes specific; the linked-
-- replacement mechanism here does not change.
--
-- Next-morning check (docs/06 §6.2 "Schedule a next-morning check"). There is no
-- reminder/scheduling engine yet (notifications are roadmap 24). The honest, light
-- version is recorded here: a new nullable flag, next_morning_check_expected, is set
-- on the replacement so the app can later surface that a next-morning check is
-- expected for that session. Building the reminder itself is a declared seam for
-- roadmap 24.
--
-- Which sessions may be substituted: only currently-active GATED sessions — running
-- or demanding lower-body (strength) — mirroring classifySession in
-- domain/training/schedulingRules.ts and the gating in start_scheduled_session. Those
-- are the sessions an amber result speaks to; cardio, rest and achilles days are not
-- substituted through this path.
--
-- Hardening, following seed_private_plan and the readiness functions: set search_path
-- = '' and schema-qualify every reference, granted to authenticated only, never anon.

alter table public.scheduled_sessions
  add column if not exists next_morning_check_expected boolean not null default false;

comment on column public.scheduled_sessions.next_morning_check_expected is
  'True when a next-morning readiness check is expected for this session (docs/06 §6.2), set on the replacement created by substitute_session after an amber result. The reminder/scheduling that surfaces it is a roadmap 24 seam; this flag is the light, honest record of the expectation.';

create or replace function public.substitute_session(
  p_original_session_id uuid,
  p_new_type text,
  p_new_template_id uuid default null,
  p_reason text default null,
  -- The amber result always asks for a next-morning check (docs/06 §6.2); the caller
  -- can opt out for a case that does not need one. Recorded on the replacement.
  p_expect_next_morning_check boolean default true
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_status public.session_status;
  v_session_type text;
  v_scheduled_date date;
  v_plan_week_id uuid;
  v_new_id uuid;
begin
  if v_user_id is null then
    raise exception 'substitute_session requires an authenticated user'
      using errcode = '28000';
  end if;
  if p_original_session_id is null then
    raise exception 'substitute_session requires an original session id'
      using errcode = '22004';
  end if;

  -- Only 'cardio' (a walk / bike / cross-trainer, the specific activity captured in
  -- the reason) or 'rest' — the approved amber substitution targets. Distinct cardio
  -- activity types are roadmap 16 (see the header note).
  if p_new_type is null or p_new_type not in ('cardio', 'rest') then
    raise exception 'substitute_session new type must be cardio or rest'
      using errcode = '22023';
  end if;

  -- Load and LOCK the caller's own original session. Running as SECURITY INVOKER, the
  -- select only sees rows row-level security permits, so a session belonging to
  -- another user is simply not found. FOR UPDATE serialises concurrent substitutions
  -- of the same session so a second replacement can never be created.
  select scheduled_sessions.status,
         scheduled_sessions.session_type,
         scheduled_sessions.scheduled_date,
         scheduled_sessions.plan_week_id
    into v_status, v_session_type, v_scheduled_date, v_plan_week_id
    from public.scheduled_sessions
   where scheduled_sessions.id = p_original_session_id
     and scheduled_sessions.user_id = v_user_id
   for update;

  if v_status is null then
    raise exception 'scheduled session not found for this user'
      using errcode = 'P0002';
  end if;

  -- Guard: only a currently-planned session can be substituted. This rejects an
  -- already-'replaced' session (so no second replacement is ever created) as well as
  -- completed, in-progress, skipped or cancelled ones.
  if v_status <> 'planned' then
    raise exception
      'only a planned session can be substituted (this session is %); no replacement was created', v_status
      using errcode = 'P0001';
  end if;

  -- Only gated sessions — running or demanding lower-body (strength) — are amber-
  -- substitutable, mirroring classifySession and start_scheduled_session. Cardio,
  -- rest and achilles days are not substituted through this path.
  if v_session_type not in ('running', 'strength') then
    raise exception
      'only running or strength sessions can be substituted (this session is %)', v_session_type
      using errcode = 'P0001';
  end if;

  -- 1. Preserve the original as the audit trail; mark it replaced.
  update public.scheduled_sessions
     set status = 'replaced'
   where id = p_original_session_id
     and user_id = v_user_id;

  -- 2. Insert the linked replacement on the same date and plan week.
  insert into public.scheduled_sessions (
    user_id,
    plan_week_id,
    template_id,
    scheduled_date,
    session_type,
    status,
    source,
    replacement_for_id,
    reschedule_reason,
    next_morning_check_expected
  ) values (
    v_user_id,
    v_plan_week_id,
    p_new_template_id,
    v_scheduled_date,
    p_new_type,
    'planned',
    'user',
    p_original_session_id,
    p_reason,
    coalesce(p_expect_next_morning_check, false)
  )
  returning scheduled_sessions.id into v_new_id;

  return v_new_id;
end;
$$;

-- Only signed-in users may substitute a session, and never the anonymous role.
revoke all on function public.substitute_session(uuid, text, uuid, text, boolean)
  from public, anon;
grant execute on function public.substitute_session(uuid, text, uuid, text, boolean)
  to authenticated;
