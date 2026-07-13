-- Roadmap 17: the running progression engine (docs/06 §6.3).
--
-- The rules themselves are pure TypeScript (domain/training/runningProgression.ts).
-- This migration only lays down the data the engine reads and the table it writes
-- its proposals to. Nothing here decides or applies progression; a proposal is
-- always created 'proposed' and only the user's explicit confirmation (accepting
-- the proposal) records readiness to advance. Roadmap 16 built the cardio PLAYER and
-- seeded the nine run-walk stages; this roadmap builds the engine that PROPOSES
-- advancing, repeating, regressing or pausing a stage. Like strength progression
-- (roadmap 12) it proposes only; it never moves the user's stage automatically.
--
-- Two schema changes and a seed update:
--   1. cardio_templates.required_sessions — how many completed sessions at a stage
--      before it is eligible to advance (docs/06 §6.3 "Required sessions were
--      completed"). §6.3 does not state a number, so 2 is a documented default,
--      expressed once (the v_required_sessions constant in seed_cardio_stages) and
--      easy to change. Not null with a default, so existing rows backfill to 2.
--   2. running_progression_proposals — a DEDICATED owner-scoped table, modelled on
--      progression_proposals (roadmap 12) but keyed on stage numbers and a plan
--      week, NOT generalised from it: progression_proposals' foreign keys are
--      exercise-keyed and its RLS and tests are proven, so it is left untouched.
--   3. seed_cardio_stages is recreated so fresh seeds carry required_sessions.

-- 1. Required sessions per stage ----------------------------------------------
--
-- Not null with a default of 2 so every already-seeded stage template backfills to
-- 2 automatically; a future per-stage value only needs the seed's values list
-- changing. The engine reads this as the count of completed sessions a stage needs
-- before it is eligible to advance.
alter table public.cardio_templates
  add column if not exists required_sessions integer not null default 2
    check (required_sessions > 0);

comment on column public.cardio_templates.required_sessions is
  'How many completed sessions at this stage before it is eligible to advance (docs/06 §6.3). Defaults to 2; docs/06 §6.3 does not state a number, so this is a documented default.';

-- 2. Running progression proposals --------------------------------------------
--
-- One row per running-progression evaluation, modelled on progression_proposals
-- (roadmap 12): owner-scoped, carrying the decision, the human-readable reasons and
-- the exact inputs used, plus the rule version. A DEDICATED table rather than a
-- generalisation of progression_proposals, whose columns (template_exercise_id,
-- exercise_id, workout_log_id) are strength-specific. The engine only ever proposes;
-- status starts 'proposed' and moves to 'accepted' (the user's explicit readiness
-- confirmation, docs/06 §6.3) or 'dismissed', stamping decided_at. Nothing is
-- applied automatically — applying an accepted advance to the forward schedule is a
-- declared seam (see CLAUDE.md), because the base plan does not yet link a scheduled
-- cardio session to a stage.
--
-- plan_week_id is the week the proposal is for; the now-live same-week volume
-- warning (docs/06 §6.5) keys on it — an accepted lower-body strength increase in
-- the SAME plan week as a running advance surfaces evaluateVolumeIncrease's soft
-- conflict. The composite (plan_week_id, user_id) FK sets the link null on delete
-- rather than dropping the proposal, matching scheduled_sessions.
create table if not exists public.running_progression_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  from_stage_number integer not null check (from_stage_number > 0),
  to_stage_number integer not null check (to_stage_number > 0),
  plan_week_id uuid,
  decision text not null check (decision in ('advance', 'repeat', 'regress', 'pause')),
  reasons jsonb not null default '[]'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  rule_version text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (plan_week_id, user_id)
    references public.plan_weeks(id, user_id) on delete set null (plan_week_id)
);

-- Indexes consistent with 20260711090400: the owner + status + recency listing the
-- surface uses to fetch the newest 'proposed' proposal.
create index if not exists running_progression_proposals_user_status_created_idx
  on public.running_progression_proposals (user_id, status, created_at desc);

-- Row-level security, following 20260711090500 and the strength proposal table:
-- deny anon, isolate by auth.uid(), and grant the owner select/insert/update (never
-- delete — a proposal is a record, not something the user removes).
alter table public.running_progression_proposals enable row level security;
revoke all on table public.running_progression_proposals from public, anon;
grant select, insert, update on table public.running_progression_proposals to authenticated;

drop policy if exists "running progression proposals owner select" on public.running_progression_proposals;
create policy "running progression proposals owner select" on public.running_progression_proposals for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "running progression proposals owner insert" on public.running_progression_proposals;
create policy "running progression proposals owner insert" on public.running_progression_proposals for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "running progression proposals owner update" on public.running_progression_proposals;
create policy "running progression proposals owner update" on public.running_progression_proposals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 3. Recreate seed_cardio_stages so it seeds required_sessions -----------------
--
-- The body is identical to 20260718090000 except the required_sessions column is
-- now written for each seeded stage, from the single v_required_sessions constant
-- (all nine stages use the documented default of 2). Still security invoker,
-- idempotent, and owner-scoped, so seed_private_plan's call is unchanged and repeat
-- and reset seeds stay safe. Existing rows already carry required_sessions from the
-- column default above, so no separate backfill is needed.
create or replace function public.seed_cardio_stages()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_warmup_seconds constant integer := 300;
  v_cooldown_seconds constant integer := 300;
  -- docs/06 §6.3 requires "required sessions were completed" to advance but states
  -- no number. Two is a conservative default for a returning beginner; changing it
  -- here (or per stage in the values list below) is the single point of control.
  v_required_sessions constant integer := 2;
  v_template_id uuid;
  v_step integer;
  v_rep integer;
  v_total_seconds integer;
  v_seeded integer := 0;
  s record;
begin
  if v_user_id is null then
    raise exception 'seed_cardio_stages requires an authenticated user'
      using errcode = '28000';
  end if;

  -- Idempotent: leave any already-seeded stage library untouched.
  if exists (
    select 1 from public.cardio_templates
    where user_id = v_user_id and stage_number is not null
  ) then
    return 0;
  end if;

  for s in
    select * from (values
      (1,   60, 120, 8),
      (2,   90, 120, 8),
      (3,  120, 120, 7),
      (4,  180, 120, 6),
      (5,  300, 120, 4),
      (6,  480, 120, 3),
      (7,  720, 120, 2),
      (8, 1200,   0, 1),
      (9, 1500,   0, 1)
    ) as t(stage, run_sec, walk_sec, repeats)
  loop
    v_total_seconds :=
      v_warmup_seconds + s.repeats * (s.run_sec + s.walk_sec) + v_cooldown_seconds;

    insert into public.cardio_templates
      (user_id, name, stage_number, session_type, estimated_minutes, required_sessions)
    values (
      v_user_id,
      case when s.walk_sec = 0
        then 'Continuous run stage ' || s.stage
        else 'Run-walk stage ' || s.stage
      end,
      s.stage,
      'run_walk',
      ceil(v_total_seconds / 60.0),
      v_required_sessions
    )
    returning id into v_template_id;

    v_step := 1;

    -- Warm-up.
    insert into public.cardio_interval_steps
      (user_id, cardio_template_id, step_order, activity_type, duration_seconds, cue_text)
    values (
      v_user_id, v_template_id, v_step, 'warmup', v_warmup_seconds,
      'Warm up — easy walk to loosen up'
    );
    v_step := v_step + 1;

    -- Run / walk repeats. A continuous stage (walk_sec = 0) has no walk steps.
    for v_rep in 1..s.repeats loop
      insert into public.cardio_interval_steps
        (user_id, cardio_template_id, step_order, activity_type, duration_seconds, cue_text)
      values (
        v_user_id, v_template_id, v_step, 'run', s.run_sec,
        case when s.walk_sec = 0
          then 'Run at a steady, easy pace'
          else 'Run at an easy, conversational pace'
        end
      );
      v_step := v_step + 1;

      if s.walk_sec > 0 then
        insert into public.cardio_interval_steps
          (user_id, cardio_template_id, step_order, activity_type, duration_seconds, cue_text)
        values (
          v_user_id, v_template_id, v_step, 'walk', s.walk_sec,
          'Walk to recover'
        );
        v_step := v_step + 1;
      end if;
    end loop;

    -- Cool-down.
    insert into public.cardio_interval_steps
      (user_id, cardio_template_id, step_order, activity_type, duration_seconds, cue_text)
    values (
      v_user_id, v_template_id, v_step, 'cooldown', v_cooldown_seconds,
      'Cool down — easy walk'
    );

    v_seeded := v_seeded + 1;
  end loop;

  return v_seeded;
end;
$$;

revoke all on function public.seed_cardio_stages() from public, anon;
grant execute on function public.seed_cardio_stages() to authenticated;
