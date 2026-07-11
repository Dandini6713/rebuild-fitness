-- Deny anonymous access and isolate every private record by auth.uid().

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
    'workout_template_exercises',
    'training_plans',
    'plan_weeks',
    'scheduled_sessions',
    'readiness_checkins',
    'workout_logs',
    'exercise_logs',
    'set_logs',
    'nutrition_targets',
    'foods',
    'nutrition_logs',
    'alcohol_logs',
    'body_measurements',
    'weekly_reviews',
    'audit_events'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon', table_name);
  end loop;
end
$$;

grant select, insert, update, delete on table
  public.profiles,
  public.goals,
  public.health_context,
  public.training_plans,
  public.plan_weeks,
  public.scheduled_sessions,
  public.workout_logs,
  public.exercise_logs,
  public.set_logs,
  public.nutrition_targets,
  public.foods,
  public.nutrition_logs,
  public.alcohol_logs,
  public.body_measurements,
  public.weekly_reviews
to authenticated;

-- A trusted server/shared-domain path must validate classification before writing.
grant select, delete on table public.readiness_checkins to authenticated;
grant select, insert on table public.audit_events to authenticated;
grant select on table public.exercises to authenticated;
grant select, insert, update, delete on table public.workout_templates, public.workout_template_exercises to authenticated;
revoke all on function public.set_updated_at() from public, anon, authenticated;

drop policy if exists "profiles owner access" on public.profiles;
create policy "profiles owner access" on public.profiles for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "goals owner access" on public.goals;
create policy "goals owner access" on public.goals for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "health context owner access" on public.health_context;
create policy "health context owner access" on public.health_context for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "plans owner access" on public.training_plans;
create policy "plans owner access" on public.training_plans for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "plan weeks owner access" on public.plan_weeks;
create policy "plan weeks owner access" on public.plan_weeks for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "sessions owner access" on public.scheduled_sessions;
create policy "sessions owner access" on public.scheduled_sessions for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "readiness owner access" on public.readiness_checkins;
create policy "readiness owner access" on public.readiness_checkins for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "workout logs owner access" on public.workout_logs;
create policy "workout logs owner access" on public.workout_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "exercise logs owner access" on public.exercise_logs;
create policy "exercise logs owner access" on public.exercise_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "set logs owner access" on public.set_logs;
create policy "set logs owner access" on public.set_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "targets owner access" on public.nutrition_targets;
create policy "targets owner access" on public.nutrition_targets for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "foods owner access" on public.foods;
create policy "foods owner access" on public.foods for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "nutrition logs owner access" on public.nutrition_logs;
create policy "nutrition logs owner access" on public.nutrition_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "alcohol logs owner access" on public.alcohol_logs;
create policy "alcohol logs owner access" on public.alcohol_logs for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "measurements owner access" on public.body_measurements;
create policy "measurements owner access" on public.body_measurements for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "reviews owner access" on public.weekly_reviews;
create policy "reviews owner access" on public.weekly_reviews for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "audit owner read" on public.audit_events;
create policy "audit owner read" on public.audit_events for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "audit owner insert" on public.audit_events;
create policy "audit owner insert" on public.audit_events for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists "authenticated catalogue read" on public.exercises;
create policy "authenticated catalogue read" on public.exercises for select to authenticated using (true);

drop policy if exists "template read access" on public.workout_templates;
create policy "template read access" on public.workout_templates for select to authenticated
using (is_system or (select auth.uid()) = user_id);

drop policy if exists "template owner write" on public.workout_templates;
create policy "template owner write" on public.workout_templates for all to authenticated
using (not is_system and (select auth.uid()) = user_id)
with check (not is_system and (select auth.uid()) = user_id);

drop policy if exists "template exercise read access" on public.workout_template_exercises;
create policy "template exercise read access" on public.workout_template_exercises for select to authenticated
using (
  exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and (
        (workout_templates.is_system and workout_template_exercises.user_id is null)
        or (
          workout_templates.user_id = (select auth.uid())
          and workout_template_exercises.user_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists "template exercise owner write" on public.workout_template_exercises;
create policy "template exercise owner write" on public.workout_template_exercises for all to authenticated
using (
  exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and not workout_templates.is_system
      and workout_templates.user_id = (select auth.uid())
      and workout_template_exercises.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.workout_templates
    where workout_templates.id = workout_template_exercises.template_id
      and not workout_templates.is_system
      and workout_templates.user_id = (select auth.uid())
      and workout_template_exercises.user_id = (select auth.uid())
  )
);
