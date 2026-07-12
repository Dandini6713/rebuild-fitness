-- Roadmap 06: authenticated, idempotent seed for the private twelve-week plan.
--
-- Runs as the calling user (security invoker) so auth.uid() identifies the owner
-- and row-level security is enforced on every write. It is invoked over
-- PostgREST RPC from the mobile client after onboarding is confirmed; it cannot
-- live in supabase/seed.sql, which has no authenticated user (see the note at
-- the bottom of that file). The whole body runs in the caller's transaction, so
-- a plan and all of its weeks and sessions commit together — a half-seeded plan
-- can never be read as active. The plan is created in a 'pending' state and only
-- flipped to 'active' once every week and session has been written.
--
-- Idempotent. If the user already has an active plan and p_reset is false the
-- call is a no-op that returns the existing plan id. p_reset deletes the current
-- active plan (its weeks and sessions cascade) together with the two onboarding
-- templates, then recreates everything. Repeated calls therefore always leave
-- exactly one active plan.
--
-- Base structure only. No strength load or running progression is baked in; the
-- schedule is the canvas those later prompts adjust (roadmap 12 and 17).
-- Availability-based day mapping and equipment/activity substitution are out of
-- scope (roadmap 15): the canonical Monday–Sunday persona pattern is laid down
-- and only the start date comes from onboarding. The plan content mirrors the
-- reference at the bottom of supabase/seed.sql; the exercise catalogue seeded
-- there is referenced by slug rather than re-inserted.

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
      (user_id, template_id, exercise_id, exercise_order, target_sets, rep_min, rep_max)
    select v_user_id, v_template_a, e.id, x.ord, x.sets, x.rep_min, x.rep_max
    from (values
      ('leg-press', 1, 2, 8, 12),
      ('machine-chest-press', 2, 2, 8, 12),
      ('seated-cable-row', 3, 2, 8, 12),
      ('dumbbell-rdl', 4, 2, 8, 12),
      ('standing-calf-raise', 5, 3, 10, 15),
      -- Dead bug is prescribed 2 x 6-10 per side; the "per side" is a coaching
      -- cue not modelled as a column here.
      ('dead-bug', 6, 2, 6, 10)
    ) as x(slug, ord, sets, rep_min, rep_max)
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
      (user_id, template_id, exercise_id, exercise_order, target_sets, rep_min, rep_max)
    select v_user_id, v_template_b, e.id, x.ord, x.sets, x.rep_min, x.rep_max
    from (values
      ('low-step-up', 1, 2, 8, 8),
      ('lat-pulldown', 2, 2, 8, 12),
      ('machine-shoulder-press', 3, 2, 8, 12),
      ('glute-bridge', 4, 2, 10, 15),
      ('seated-calf-raise', 5, 3, 10, 15),
      -- Farmer carry is prescribed 2 x 30-45 seconds; a time-based hold has no
      -- rep range, so reps are left null and the duration is not yet modelled.
      ('farmer-carry', 6, 2, null, null)
    ) as x(slug, ord, sets, rep_min, rep_max)
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
