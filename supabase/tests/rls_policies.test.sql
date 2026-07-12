begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

create temporary table rls_mutation_results (
  operation text primary key,
  affected_rows integer not null
) on commit drop;

grant select, insert on table rls_mutation_results to authenticated;

select is(
  (
    select count(*)::integer
    from pg_class
    where relnamespace = 'public'::regnamespace
      and relkind = 'r'
      and relname = any (array[
        'profiles', 'goals', 'health_context', 'exercises', 'workout_templates',
        'workout_template_exercises', 'training_plans', 'plan_weeks', 'scheduled_sessions',
        'readiness_checkins', 'workout_logs', 'exercise_logs', 'set_logs', 'nutrition_targets',
        'foods', 'nutrition_logs', 'alcohol_logs', 'body_measurements', 'weekly_reviews', 'audit_events'
      ])
      and relrowsecurity
  ),
  20,
  'RLS is enabled on every application table'
);

select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and grantee in ('anon', 'PUBLIC')
      and table_name = any (array[
        'profiles', 'goals', 'health_context', 'exercises', 'workout_templates',
        'workout_template_exercises', 'training_plans', 'plan_weeks', 'scheduled_sessions',
        'readiness_checkins', 'workout_logs', 'exercise_logs', 'set_logs', 'nutrition_targets',
        'foods', 'nutrition_logs', 'alcohol_logs', 'body_measurements', 'weekly_reviews', 'audit_events'
      ])
  ),
  0,
  'anonymous role has no table grants'
);

select is(
  (
    select count(*)::integer
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name = 'readiness_checkins'
      and grantee = 'authenticated'
      and privilege_type in ('INSERT', 'UPDATE')
  ),
  0,
  'mobile clients cannot submit an arbitrary readiness classification'
);

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'rls-user-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'rls-user-b@example.invalid');

insert into public.profiles (user_id, display_name)
values
  ('11111111-1111-4111-8111-111111111111', 'User A'),
  ('22222222-2222-4222-8222-222222222222', 'User B');

insert into public.health_context (user_id, context_type, description)
values
  ('11111111-1111-4111-8111-111111111111', 'test', 'User A private context'),
  ('22222222-2222-4222-8222-222222222222', 'test', 'User B private context');

insert into public.exercises (slug, name, category)
values ('rls-test-exercise', 'RLS test exercise', 'test');

insert into public.training_plans (id, user_id, name, starts_on)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'User A plan', current_date),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'User B plan', current_date);

-- A template, template exercise and progression proposal per user, so the owner
-- isolation of progression_proposals (roadmap 12) can be asserted the same way as
-- profiles and health_context above.
insert into public.workout_templates (id, user_id, name, session_type, is_system)
values
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '11111111-1111-4111-8111-111111111111', 'User A template', 'strength', false),
  ('dddddddd-dddd-4ddd-8ddd-dddddddddddd', '22222222-2222-4222-8222-222222222222', 'User B template', 'strength', false);

insert into public.workout_template_exercises
  (id, user_id, template_id, exercise_id, exercise_order, target_sets)
values
  (
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    '11111111-1111-4111-8111-111111111111',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    (select id from public.exercises where slug = 'rls-test-exercise'),
    1, 2
  ),
  (
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    '22222222-2222-4222-8222-222222222222',
    'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
    (select id from public.exercises where slug = 'rls-test-exercise'),
    1, 2
  );

insert into public.progression_proposals
  (user_id, template_exercise_id, exercise_id, decision, rule_version)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
    (select id from public.exercises where slug = 'rls-test-exercise'),
    'hold', 'rls-proposal-a'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'ffffffff-ffff-4fff-8fff-ffffffffffff',
    (select id from public.exercises where slug = 'rls-test-exercise'),
    'hold', 'rls-proposal-b'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select results_eq(
  $$ select display_name from public.profiles order by display_name $$,
  array['User A'::text],
  'a user can select only their own profile'
);

select results_eq(
  $$ select description from public.health_context order by description $$,
  array['User A private context'::text],
  'health context is isolated by owner'
);

with changed as (
  update public.profiles
  set display_name = 'Changed'
  where user_id = '22222222-2222-4222-8222-222222222222'
  returning 1
)
insert into rls_mutation_results (operation, affected_rows)
select 'update_other_profile', count(*)::integer from changed;

select is(
  (select affected_rows from rls_mutation_results where operation = 'update_other_profile'),
  0,
  'a user cannot update another user profile'
);

with removed as (
  delete from public.health_context
  where user_id = '22222222-2222-4222-8222-222222222222'
  returning 1
)
insert into rls_mutation_results (operation, affected_rows)
select 'delete_other_health_context', count(*)::integer from removed;

select is(
  (select affected_rows from rls_mutation_results where operation = 'delete_other_health_context'),
  0,
  'a user cannot delete another user health context'
);

select results_eq(
  $$ select rule_version from public.progression_proposals order by rule_version $$,
  array['rls-proposal-a'::text],
  'progression proposals are isolated to their owner'
);

with changed as (
  update public.progression_proposals
  set status = 'dismissed'
  where user_id = '22222222-2222-4222-8222-222222222222'
  returning 1
)
insert into rls_mutation_results (operation, affected_rows)
select 'update_other_proposal', count(*)::integer from changed;

select is(
  (select affected_rows from rls_mutation_results where operation = 'update_other_proposal'),
  0,
  'a user cannot update another user progression proposal'
);

select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);

select results_eq(
  $$ select display_name from public.profiles where user_id = '22222222-2222-4222-8222-222222222222' $$,
  array['User B'::text],
  'User B profile remains unchanged after User A update attempt'
);

select results_eq(
  $$ select description from public.health_context where user_id = '22222222-2222-4222-8222-222222222222' $$,
  array['User B private context'::text],
  'User B health context remains after User A delete attempt'
);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);

select throws_ok(
  $$ insert into public.goals (user_id, goal_type) values ('22222222-2222-4222-8222-222222222222', 'cross-user') $$,
  '42501',
  'new row violates row-level security policy for table "goals"',
  'a user cannot insert a row owned by another user'
);

select throws_ok(
  $$
    insert into public.plan_weeks (user_id, training_plan_id, week_number, starts_on)
    values (
      '11111111-1111-4111-8111-111111111111',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      1,
      current_date
    )
  $$,
  '23503',
  'insert or update on table "plan_weeks" violates foreign key constraint "plan_weeks_training_plan_id_user_id_fkey"',
  'composite foreign keys prevent cross-user parent references'
);

select results_eq(
  $$ select slug from public.exercises where slug = 'rls-test-exercise' $$,
  array['rls-test-exercise'::text],
  'authenticated users can read the curated exercise catalogue'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select * from public.profiles $$,
  '42501',
  'permission denied for table profiles',
  'anonymous users cannot read private profiles'
);

select * from finish();
rollback;
