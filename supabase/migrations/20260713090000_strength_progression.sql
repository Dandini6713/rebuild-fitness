-- Roadmap 12: the strength progression engine (docs/06 §6.4).
--
-- The rules themselves are pure TypeScript (domain/training/strengthProgression.ts).
-- This migration only lays down the data the engine reads and the table it writes
-- its proposals to. Nothing here decides or applies progression; a proposal is
-- always created 'proposed' and only the user's explicit acceptance changes weight.
--
-- Three schema changes and a seed update:
--   1. set_logs.technique_controlled — the per-set "was technique controlled?" flag
--      the increase rule requires. Nullable, and null must never satisfy the
--      increase criteria (fail safe).
--   2. workout_template_exercises.weight_increment_kg / single_exposure_progression —
--      the per-exercise progression configuration. A null increment marks an
--      exercise ineligible for weight-increase proposals.
--   3. progression_proposals — one owner-scoped row per evaluated exposure, modelled
--      on readiness_checkins.
--   4. seed_private_plan is recreated so fresh seeds carry the increments, and the
--      same values are backfilled onto any already-seeded template rows.

-- 1. Per-set technique flag ---------------------------------------------------
--
-- Nullable on purpose: every set logged before this migration stays null, and any
-- future set where the flag was not captured is null too. The increase rule
-- (docs/06 §6.4) treats a null technique as "not controlled" and refuses to
-- propose an increase — a null must never count as controlled.
alter table public.set_logs
  add column if not exists technique_controlled boolean;

comment on column public.set_logs.technique_controlled is
  'Whether the lifter marked technique as controlled on this set (docs/06 §6.4). Nullable: historical rows and any uncaptured set stay null, and null never satisfies the strength-increase criteria (fail safe).';

-- 2. Per-exercise progression configuration -----------------------------------
--
-- weight_increment_kg is the only permitted automatic step for this exercise; the
-- engine may never propose more than exactly this (docs/06 §6.4). It is nullable,
-- and a null increment is deliberate: it means the exercise is NOT eligible for
-- weight-increase proposals at all. Time-held movements (the farmer carry) and the
-- unloaded dead bug stay null — there is no bar weight to add to.
--
-- single_exposure_progression: when true, one qualifying exposure is enough to
-- propose an increase; otherwise two are required. Defaults to false (the docs/06
-- §6.4 default of "two exposures"). Not null with a default so existing rows are
-- unambiguous.
alter table public.workout_template_exercises
  add column if not exists weight_increment_kg numeric(5, 2)
    check (weight_increment_kg is null or weight_increment_kg > 0),
  add column if not exists single_exposure_progression boolean not null default false;

comment on column public.workout_template_exercises.weight_increment_kg is
  'The exercise''s permitted automatic weight step in kg (docs/06 §6.4). Null means the exercise is not eligible for weight-increase proposals (e.g. the farmer carry and dead bug).';
comment on column public.workout_template_exercises.single_exposure_progression is
  'When true, a single qualifying exposure may propose an increase; otherwise two are required (docs/06 §6.4).';

-- 3. Progression proposals ----------------------------------------------------
--
-- One row per exercise evaluated when a strength workout completes, modelled on
-- readiness_checkins: owner-scoped, carrying the decision, the human-readable
-- reasons and the exact inputs used, plus the rule version. The engine only ever
-- proposes; status starts 'proposed' and moves to 'accepted' or 'dismissed' by the
-- user's explicit action, stamping decided_at. Nothing is applied automatically.
create table if not exists public.progression_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- The template exercise the proposal is for. Cascades if the template exercise
  -- is removed (e.g. a plan reset drops and rebuilds the templates).
  template_exercise_id uuid not null references public.workout_template_exercises(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id),
  -- The exposure (workout_logs row) whose completion triggered the evaluation. Set
  -- null if that log is later removed, using the composite user_id FK pattern the
  -- other owner-scoped references use, so the proposal outlives its trigger.
  workout_log_id uuid,
  decision text not null check (decision in ('increase', 'hold', 'reduce_or_substitute')),
  proposed_weight_kg numeric(6, 2) check (proposed_weight_kg is null or proposed_weight_kg >= 0),
  current_weight_kg numeric(6, 2) check (current_weight_kg is null or current_weight_kg >= 0),
  reasons jsonb not null default '[]'::jsonb,
  inputs jsonb not null default '{}'::jsonb,
  rule_version text not null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'dismissed')),
  decided_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (workout_log_id, user_id) references public.workout_logs(id, user_id) on delete set null (workout_log_id)
);

-- Indexes consistent with 20260711090400: the owner+recency listing, plus a
-- lookup for the newest proposal of a given template exercise and status (the
-- player fetches the newest 'proposed' one on load).
create index if not exists progression_proposals_user_created_idx
  on public.progression_proposals (user_id, created_at desc);
create index if not exists progression_proposals_template_exercise_status_idx
  on public.progression_proposals (template_exercise_id, status, created_at desc);

-- Row-level security, following 20260711090500: deny anon, isolate by auth.uid(),
-- and grant the owner select/insert/update (never delete — a proposal is a record,
-- not something the user removes).
alter table public.progression_proposals enable row level security;
revoke all on table public.progression_proposals from public, anon;
grant select, insert, update on table public.progression_proposals to authenticated;

drop policy if exists "progression proposals owner select" on public.progression_proposals;
create policy "progression proposals owner select" on public.progression_proposals for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "progression proposals owner insert" on public.progression_proposals;
create policy "progression proposals owner insert" on public.progression_proposals for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "progression proposals owner update" on public.progression_proposals;
create policy "progression proposals owner update" on public.progression_proposals for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- 4. Seed the increments ------------------------------------------------------
--
-- Recreate seed_private_plan so a fresh seed writes weight_increment_kg for the
-- weighted movements (2.5 kg for the main compound and machine lifts, 1.0 kg for
-- the calf raises) and leaves it null for the dead bug and farmer carry. The body
-- is otherwise identical to 20260711090600; only the two template-exercise inserts
-- gain the increment column. single_exposure_progression is left at its default
-- (false) for every seeded exercise.
create or replace function public.seed_private_plan(
  p_start_date date,
  p_reset boolean default false
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_plan_id uuid;
  v_template_a uuid;
  v_template_b uuid;
  v_week_id uuid;
  v_week_start date;
  v_week integer;
begin
  if v_user_id is null then
    raise exception 'seed_private_plan requires an authenticated user'
      using errcode = '28000';
  end if;
  if p_start_date is null then
    raise exception 'seed_private_plan requires a start date'
      using errcode = '22004';
  end if;

  -- Idempotency: reuse the existing active plan unless a reset is requested.
  select id into v_plan_id
  from public.training_plans
  where user_id = v_user_id and status = 'active'
  limit 1;

  if v_plan_id is not null and not p_reset then
    return v_plan_id;
  end if;

  if p_reset then
    -- Scheduled sessions are not cascaded from their week or plan: the foreign
    -- key sets plan_week_id to null rather than deleting the session (so a loose
    -- or rescheduled session can outlive a week). A reset owns the whole plan, so
    -- delete its sessions explicitly first, then let the weeks cascade with the
    -- plan. The templates are named, so clear and recreate them cleanly below.
    delete from public.scheduled_sessions s
    using public.plan_weeks w, public.training_plans p
    where s.user_id = v_user_id
      and s.plan_week_id = w.id
      and w.training_plan_id = p.id
      and p.user_id = v_user_id
      and p.status = 'active';
    delete from public.training_plans
    where user_id = v_user_id and status = 'active';
    delete from public.workout_templates
    where user_id = v_user_id
      and not is_system
      and name in ('Strength A', 'Strength B');
    v_plan_id := null;
  end if;

  -- Reusable templates, created once per user. Reused if already present (for
  -- example a plan was cleared but the templates kept) so they never duplicate.
  select id into v_template_a
  from public.workout_templates
  where user_id = v_user_id and not is_system and name = 'Strength A'
  limit 1;
  if v_template_a is null then
    insert into public.workout_templates
      (user_id, name, session_type, estimated_minutes, is_system)
    values (v_user_id, 'Strength A', 'strength', 45, false)
    returning id into v_template_a;

    insert into public.workout_template_exercises
      (user_id, template_id, exercise_id, exercise_order, target_sets, rep_min, rep_max, weight_increment_kg)
    select v_user_id, v_template_a, e.id, x.ord, x.sets, x.rep_min, x.rep_max, x.inc
    from (values
      ('leg-press', 1, 2, 8, 12, 2.5),
      ('machine-chest-press', 2, 2, 8, 12, 2.5),
      ('seated-cable-row', 3, 2, 8, 12, 2.5),
      ('dumbbell-rdl', 4, 2, 8, 12, 2.5),
      ('standing-calf-raise', 5, 3, 10, 15, 1.0),
      -- Dead bug is prescribed 2 x 6-10 per side; the "per side" is a coaching
      -- cue not modelled as a column here. It carries no external load, so its
      -- weight increment is null (not eligible for weight-increase proposals).
      ('dead-bug', 6, 2, 6, 10, null)
    ) as x(slug, ord, sets, rep_min, rep_max, inc)
    join public.exercises e on e.slug = x.slug;
  end if;

  select id into v_template_b
  from public.workout_templates
  where user_id = v_user_id and not is_system and name = 'Strength B'
  limit 1;
  if v_template_b is null then
    insert into public.workout_templates
      (user_id, name, session_type, estimated_minutes, is_system)
    values (v_user_id, 'Strength B', 'strength', 45, false)
    returning id into v_template_b;

    insert into public.workout_template_exercises
      (user_id, template_id, exercise_id, exercise_order, target_sets, rep_min, rep_max, weight_increment_kg)
    select v_user_id, v_template_b, e.id, x.ord, x.sets, x.rep_min, x.rep_max, x.inc
    from (values
      ('low-step-up', 1, 2, 8, 8, 2.5),
      ('lat-pulldown', 2, 2, 8, 12, 2.5),
      ('machine-shoulder-press', 3, 2, 8, 12, 2.5),
      ('glute-bridge', 4, 2, 10, 15, 2.5),
      ('seated-calf-raise', 5, 3, 10, 15, 1.0),
      -- Farmer carry is prescribed 2 x 30-45 seconds; a time-based hold has no
      -- rep range, so reps are left null and the duration is not yet modelled.
      -- A carry is not progressed by a fixed bar increment here, so its increment
      -- is null (not eligible for weight-increase proposals).
      ('farmer-carry', 6, 2, null, null, null)
    ) as x(slug, ord, sets, rep_min, rep_max, inc)
    join public.exercises e on e.slug = x.slug;
  end if;

  -- Create the plan in a non-active state, write every week and session, then
  -- flip it to active as the final step so it is only ever read as complete. The
  -- twelve-week block runs from p_start_date to the last day of week twelve.
  insert into public.training_plans (user_id, name, starts_on, ends_on, status)
  values (
    v_user_id,
    'Rebuild base plan',
    p_start_date,
    p_start_date + (12 * 7 - 1),
    'pending'
  )
  returning id into v_plan_id;

  for v_week in 1..12 loop
    v_week_start := p_start_date + ((v_week - 1) * 7);

    insert into public.plan_weeks
      (user_id, training_plan_id, week_number, starts_on, status)
    values (v_user_id, v_plan_id, v_week, v_week_start, 'planned')
    returning id into v_week_id;

    -- The canonical weekly pattern, anchored to weekday offsets from the Monday
    -- start: Mon Strength A, Tue cardio, Wed Achilles, Thu Strength B, Fri and
    -- Sat cardio (walk / run-walk / longer walk), Sun rest. Only the two
    -- strength days are template-backed; the rest are typed sessions.
    insert into public.scheduled_sessions
      (user_id, plan_week_id, template_id, scheduled_date, session_type, status, source)
    select
      v_user_id,
      v_week_id,
      case d.day_offset
        when 0 then v_template_a
        when 3 then v_template_b
        else null
      end,
      v_week_start + d.day_offset,
      d.session_type,
      'planned',
      'plan'
    from (values
      (0, 'strength'),
      (1, 'cardio'),
      (2, 'achilles'),
      (3, 'strength'),
      (4, 'cardio'),
      (5, 'cardio'),
      (6, 'rest')
    ) as d(day_offset, session_type);
  end loop;

  update public.training_plans set status = 'active' where id = v_plan_id;

  return v_plan_id;
end;
$$;

-- Only signed-in users may seed, and never the anonymous role.
revoke all on function public.seed_private_plan(date, boolean) from public, anon;
grant execute on function public.seed_private_plan(date, boolean) to authenticated;

-- Backfill the increments onto any template rows already seeded before this
-- migration, keyed by the shared catalogue slug so it matches whatever exercise
-- ids a given user's templates were built from. Idempotent: it re-sets the same
-- values, and the dead bug / farmer carry are intentionally absent so they stay
-- null. Runs as the migration owner, so it reaches every user's rows.
update public.workout_template_exercises wte
set weight_increment_kg = m.inc
from (values
  ('leg-press', 2.5::numeric),
  ('machine-chest-press', 2.5),
  ('seated-cable-row', 2.5),
  ('dumbbell-rdl', 2.5),
  ('standing-calf-raise', 1.0),
  ('low-step-up', 2.5),
  ('lat-pulldown', 2.5),
  ('machine-shoulder-press', 2.5),
  ('glute-bridge', 2.5),
  ('seated-calf-raise', 1.0)
) as m(slug, inc)
join public.exercises e on e.slug = m.slug
where wte.exercise_id = e.id;
