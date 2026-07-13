-- Roadmap 16: the cardio interval player and the nine run-walk stages (docs/05
-- §5.6, docs/06 §6.3, S-014).
--
-- Three owner-scoped tables, all modelled on the existing planning/workout tables
-- (20260711090200) and protected exactly as 20260711090500 protects the rest:
--
--   cardio_templates      — an interval session and the progression stage it is
--                           for (a name, a nullable stage_number, the activity
--                           kind, an estimate). One per user per stage.
--   cardio_interval_steps — the ordered steps of a template (warm-up, run, walk,
--                           cool-down, …), each with a duration and a short cue.
--   cardio_logs           — one row per started cardio session, shaped like
--                           workout_logs: started/completed/status/effort/notes,
--                           the scheduled_session and template links, and a
--                           nullable duration and distance.
--
-- Distance is present but nullable and UNUSED this roadmap: there is no GPS yet
-- (a declared seam — "do not add GPS yet"). The column exists so the later
-- distance work is an additive change, not a schema migration.
--
-- The nine run-walk stages themselves are OWNER-SCOPED reference data (each user
-- owns their own copy, exactly like the strength templates), so they cannot live
-- in supabase/seed.sql (which has no authenticated user). They are seeded by a new
-- security-invoker function, seed_cardio_stages(), which seed_private_plan calls —
-- so every seeded plan lays down the stage library for its owner. See §6.3: this
-- roadmap only PLAYS a stage and SEEDS the nine; deciding when to advance a stage
-- is the running-progression engine (roadmap 17) and is NOT built here.
--
-- How a scheduled cardio session connects to a stage is deliberately left open:
-- the base plan types every low-impact cardio day as one 'cardio' session_type
-- (the roadmap 09 seam) with no template link, and choosing which stage to play is
-- the roadmap 17 progression concern. Until then the player plays the lowest
-- available stage. The cardio_templates seeded here are the natural home for that
-- future per-session link.

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.cardio_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  -- The run-walk progression stage this template is for (docs/06 §6.3), 1..9.
  -- Nullable so a plain walk / bike / cross-trainer template (no staged
  -- progression) can exist too; Postgres allows many NULLs under the unique below.
  stage_number integer check (stage_number is null or stage_number > 0),
  -- The activity kind this template plays. 'run_walk' for the staged programme;
  -- 'walk' / 'bike' / 'cross_trainer' for the other cardio options the one player
  -- also drives. Kept as a checked text (not an enum) so new kinds are an additive
  -- change, matching how session_type is handled on scheduled_sessions.
  session_type text not null default 'run_walk'
    check (session_type in ('run_walk', 'walk', 'bike', 'cross_trainer')),
  estimated_minutes integer check (estimated_minutes is null or estimated_minutes > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  -- One staged template per stage per user. NULL stages (walk/bike) are exempt,
  -- since Postgres treats NULLs as distinct in a unique index.
  unique (user_id, stage_number)
);

create table if not exists public.cardio_interval_steps (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  cardio_template_id uuid not null,
  step_order integer not null check (step_order > 0),
  activity_type text not null check (
    activity_type in ('warmup', 'run', 'walk', 'cooldown', 'bike', 'cross_trainer', 'rest')
  ),
  duration_seconds integer not null check (duration_seconds > 0),
  cue_text text check (char_length(cue_text) <= 200),
  created_at timestamptz not null default now(),
  unique (cardio_template_id, step_order),
  unique (id, user_id),
  foreign key (cardio_template_id, user_id)
    references public.cardio_templates(id, user_id) on delete cascade
);

create table if not exists public.cardio_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_session_id uuid,
  cardio_template_id uuid,
  started_at timestamptz not null,
  completed_at timestamptz,
  status public.session_status not null default 'in_progress',
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  -- Nullable and unused this roadmap: no GPS / distance tracking yet (declared seam).
  distance_m numeric(8, 2) check (distance_m is null or distance_m >= 0),
  session_effort integer check (session_effort between 1 and 10),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at),
  unique (id, user_id),
  foreign key (scheduled_session_id, user_id)
    references public.scheduled_sessions(id, user_id) on delete set null (scheduled_session_id),
  foreign key (cardio_template_id, user_id)
    references public.cardio_templates(id, user_id) on delete set null (cardio_template_id)
);

comment on column public.cardio_logs.distance_m is
  'Distance covered in metres where available. Nullable and unused in roadmap 16 (no GPS yet); a declared seam for a later roadmap.';

-- 2. Indexes (consistent with 20260711090400) --------------------------------

create index if not exists cardio_templates_user_created_idx
  on public.cardio_templates (user_id, created_at desc);
create index if not exists cardio_interval_steps_template_order_idx
  on public.cardio_interval_steps (cardio_template_id, step_order);
create index if not exists cardio_interval_steps_user_created_idx
  on public.cardio_interval_steps (user_id, created_at desc);
create index if not exists cardio_logs_user_created_idx
  on public.cardio_logs (user_id, created_at desc);
create index if not exists cardio_logs_user_status_started_idx
  on public.cardio_logs (user_id, status, started_at desc);

-- Keep updated_at current on the two mutable tables, reusing the shared trigger
-- function (20260711090400). cardio_interval_steps is write-once, so it has none.
drop trigger if exists set_updated_at on public.cardio_templates;
create trigger set_updated_at before update on public.cardio_templates
  for each row execute function public.set_updated_at();
drop trigger if exists set_updated_at on public.cardio_logs;
create trigger set_updated_at before update on public.cardio_logs
  for each row execute function public.set_updated_at();

-- 3. Row-level security (following 20260711090500) -----------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'cardio_templates',
    'cardio_interval_steps',
    'cardio_logs'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon', table_name);
  end loop;
end
$$;

grant select, insert, update, delete on table
  public.cardio_templates,
  public.cardio_interval_steps,
  public.cardio_logs
to authenticated;

drop policy if exists "cardio templates owner access" on public.cardio_templates;
create policy "cardio templates owner access" on public.cardio_templates for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cardio interval steps owner access" on public.cardio_interval_steps;
create policy "cardio interval steps owner access" on public.cardio_interval_steps for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "cardio logs owner access" on public.cardio_logs;
create policy "cardio logs owner access" on public.cardio_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

-- 4. Seed the nine run-walk stages (docs/06 §6.3) ------------------------------
--
-- seed_cardio_stages is security invoker so auth.uid() owns every row and RLS is
-- satisfied, exactly like seed_private_plan. It is idempotent: if the caller
-- already has any staged (stage_number not null) cardio template it does nothing
-- and returns 0, otherwise it writes all nine and returns 9.
--
-- Each stage is a warm-up, then (run, walk) repeated, then a cool-down. The nine
-- run/walk pairings are transcribed EXACTLY from docs/06 §6.3:
--   1: run 60s  / walk 120s x8      6: run 480s / walk 120s x3
--   2: run 90s  / walk 120s x8      7: run 720s / walk 120s x2
--   3: run 120s / walk 120s x7      8: continuous run 20 min (1200s)
--   4: run 180s / walk 120s x6      9: continuous run 25 min (1500s)
--   5: run 300s / walk 120s x4
-- Stage 9 is documented as "25 to 30 minutes"; the seed uses the 25-minute lower
-- bound (a beginner returning to running), the single value being the run step's
-- duration. The warm-up and cool-down are not specified by the doc, so a fixed
-- five minutes (300s) each is used; both are expressed once, through the
-- v_warmup_seconds / v_cooldown_seconds constants below, so they are trivial to
-- change in one place.
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
      (user_id, name, stage_number, session_type, estimated_minutes)
    values (
      v_user_id,
      case when s.walk_sec = 0
        then 'Continuous run stage ' || s.stage
        else 'Run-walk stage ' || s.stage
      end,
      s.stage,
      'run_walk',
      ceil(v_total_seconds / 60.0)
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

-- 5. Recreate seed_private_plan so it also lays down the cardio stage library ---
--
-- The body is otherwise identical to 20260713090000; the only change is the
-- `perform public.seed_cardio_stages();` call, made while the plan is still
-- 'pending' so the whole seed (plan, weeks, sessions and the cardio stages)
-- commits in one transaction. seed_cardio_stages is itself idempotent, so this is
-- safe on a repeat call and on the p_reset rebuild (the stage library is reusable
-- reference data and is deliberately kept across a reset).
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
      ('farmer-carry', 6, 2, null, null, null)
    ) as x(slug, ord, sets, rep_min, rep_max, inc)
    join public.exercises e on e.slug = x.slug;
  end if;

  -- Lay down the run-walk stage library for this user (docs/06 §6.3). Idempotent
  -- and owner-scoped; done inside the same transaction as the plan.
  perform public.seed_cardio_stages();

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
