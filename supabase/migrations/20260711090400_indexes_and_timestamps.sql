-- Query indexes and consistent UTC update timestamps.

create index if not exists goals_user_created_idx on public.goals (user_id, created_at desc);
create index if not exists health_context_user_created_idx on public.health_context (user_id, created_at desc);
create index if not exists workout_templates_user_created_idx on public.workout_templates (user_id, created_at desc);
create index if not exists workout_template_exercises_template_idx on public.workout_template_exercises (template_id, exercise_order);
create index if not exists workout_template_exercises_user_created_idx on public.workout_template_exercises (user_id, created_at desc);
create index if not exists training_plans_user_created_idx on public.training_plans (user_id, created_at desc);
create index if not exists plan_weeks_user_starts_idx on public.plan_weeks (user_id, starts_on);
create index if not exists scheduled_sessions_user_date_idx on public.scheduled_sessions (user_id, scheduled_date);
create index if not exists scheduled_sessions_user_status_date_idx on public.scheduled_sessions (user_id, status, scheduled_date);
create index if not exists readiness_checkins_user_created_idx on public.readiness_checkins (user_id, created_at desc);
create index if not exists workout_logs_user_created_idx on public.workout_logs (user_id, created_at desc);
create index if not exists exercise_logs_user_created_idx on public.exercise_logs (user_id, created_at desc);
create index if not exists set_logs_user_created_idx on public.set_logs (user_id, created_at desc);
create index if not exists nutrition_targets_user_effective_idx on public.nutrition_targets (user_id, effective_from desc);
create index if not exists foods_user_created_idx on public.foods (user_id, created_at desc);
create index if not exists nutrition_logs_user_logged_idx on public.nutrition_logs (user_id, logged_at desc);
create index if not exists alcohol_logs_user_logged_idx on public.alcohol_logs (user_id, logged_at desc);
create index if not exists body_measurements_user_measured_idx on public.body_measurements (user_id, measured_at desc);
create index if not exists weekly_reviews_user_period_idx on public.weekly_reviews (user_id, period_start desc);
create index if not exists audit_events_user_created_idx on public.audit_events (user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'goals',
    'health_context',
    'exercises',
    'workout_templates',
    'training_plans',
    'plan_weeks',
    'scheduled_sessions',
    'workout_logs',
    'foods',
    'nutrition_logs',
    'alcohol_logs',
    'body_measurements'
  ]
  loop
    execute format('drop trigger if exists set_updated_at on public.%I', table_name);
    execute format(
      'create trigger set_updated_at before update on public.%I for each row execute function public.set_updated_at()',
      table_name
    );
  end loop;
end
$$;
