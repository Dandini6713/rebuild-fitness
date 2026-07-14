begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Roadmap 25: delete_account() cascade completeness and isolation (docs/04 §4.2, docs/05
-- §5.11, docs/07 §7.7, docs/10 §10.3 "account deletion removes database rows"). This is the
-- load-bearing test: a user is seeded with a row in EVERY one of the 27 user-owned tables,
-- delete_account() is called as that user, and every table must be empty for them
-- afterwards — while a second user's rows are wholly untouched. A table that failed to
-- cascade would leave orphaned personal health data, the worst failure this feature can
-- produce, so the completeness is asserted directly.

-- Two users so isolation can be proven.
insert into auth.users (id, email)
values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'delete-me@example.invalid'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'keep-me@example.invalid');

-- Shared catalogue exercise for the FK references (not user-owned; must survive deletion).
insert into public.exercises (id, slug, name, category)
values ('e1111111-1111-4111-8111-111111111111', 'leg-press-test', 'Leg press', 'strength');

-- === Seed user A across all 27 user-owned tables ============================
-- Seeded as the default (superuser) role before switching to authenticated, so RLS and
-- grants never block the fixture; the RPC's owner-scoping is what the test exercises.

insert into public.profiles (user_id, display_name, notify_sessions, notify_weigh_in)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'A', true, true);

insert into public.goals (user_id, goal_type)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'lose_fat');

insert into public.health_context (user_id, context_type)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'achilles');

insert into public.training_plans (id, user_id, name, starts_on)
values ('c1111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Plan', current_date);

insert into public.plan_weeks (id, user_id, training_plan_id, week_number, starts_on)
values ('c2222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'c1111111-1111-4111-8111-111111111111', 1, current_date);

insert into public.workout_templates (id, user_id, name, session_type, is_system)
values ('d1111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Strength A', 'strength', false);

insert into public.workout_template_exercises
  (id, user_id, template_id, exercise_id, exercise_order, target_sets)
values ('d2222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd1111111-1111-4111-8111-111111111111',
        'e1111111-1111-4111-8111-111111111111', 1, 3);

insert into public.scheduled_sessions
  (id, user_id, plan_week_id, template_id, scheduled_date, session_type)
values ('f1111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'c2222222-2222-4222-8222-222222222222',
        'd1111111-1111-4111-8111-111111111111', current_date, 'strength');

insert into public.readiness_checkins
  (user_id, scheduled_session_id, checkin_type, pain_score, stiffness_change,
   swelling_level, walking_status, sudden_change, confidence_score, classification, rule_version)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'f1111111-1111-4111-8111-111111111111', 'pre_session', 1, 'same',
        'none', 'normal', false, 4, 'green', 'readiness/v1');

insert into public.workout_logs (id, user_id, scheduled_session_id, started_at, status)
values ('f2222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'f1111111-1111-4111-8111-111111111111', now(), 'completed');

insert into public.exercise_logs (id, user_id, workout_log_id, exercise_id, exercise_order)
values ('f3333333-3333-4333-8333-333333333333',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'f2222222-2222-4222-8222-222222222222',
        'e1111111-1111-4111-8111-111111111111', 1);

insert into public.set_logs (user_id, exercise_log_id, set_number, weight_kg, repetitions, effort_score)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'f3333333-3333-4333-8333-333333333333', 1, 50, 8, 6);

insert into public.progression_proposals
  (user_id, template_exercise_id, exercise_id, workout_log_id, decision, rule_version)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'd2222222-2222-4222-8222-222222222222',
        'e1111111-1111-4111-8111-111111111111',
        'f2222222-2222-4222-8222-222222222222', 'increase', 'strength-progression/v1');

insert into public.running_progression_proposals
  (user_id, from_stage_number, to_stage_number, plan_week_id, decision, rule_version)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 3, 4,
        'c2222222-2222-4222-8222-222222222222', 'advance', 'running-progression/v1');

insert into public.cardio_templates (id, user_id, name, stage_number)
values ('a1111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Stage 1', 1);

insert into public.cardio_interval_steps
  (user_id, cardio_template_id, step_order, activity_type, duration_seconds)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'a1111111-1111-4111-8111-111111111111', 1, 'warmup', 300);

insert into public.cardio_logs (user_id, cardio_template_id, started_at, status)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'a1111111-1111-4111-8111-111111111111', now(), 'completed');

insert into public.nutrition_targets (user_id, effective_from, calories, protein_g, source)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date, 2000, 150, 'user');

insert into public.foods (id, user_id, name, calories, protein_g)
values ('b1111111-1111-4111-8111-111111111111',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Chicken', 200, 30);

insert into public.meal_templates (id, user_id, name)
values ('b2222222-2222-4222-8222-222222222222',
        'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Lunch');

insert into public.meal_template_items
  (user_id, meal_template_id, food_id, description, calories, protein_g)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'b2222222-2222-4222-8222-222222222222',
        'b1111111-1111-4111-8111-111111111111', 'Chicken', 200, 30);

insert into public.nutrition_logs
  (user_id, food_id, logged_at, meal_type, description, calories, protein_g)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        'b1111111-1111-4111-8111-111111111111', now(), 'lunch', 'Chicken', 200, 30);

insert into public.alcohol_logs
  (user_id, logged_at, drink_name, volume_ml, abv_percent, calories, units)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', now(), 'Lager', 568, 5, 200, 2.84);

insert into public.drink_favourites (user_id, drink_name, volume_ml, abv_percent, calories)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Lager', 568, 5, 200);

insert into public.body_measurements (user_id, measurement_type, value, unit, measured_at)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'weight', 80, 'kg', now());

insert into public.weekly_reviews
  (user_id, period_start, period_end, metrics, recommendations, rule_version)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', current_date - 6, current_date,
        '{}'::jsonb, '[]'::jsonb, 'weekly-review/v1');

insert into public.audit_events (user_id, event_type)
values ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'test_event');

-- === Seed user B (untouched control) =======================================
insert into public.profiles (user_id, display_name) values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'B');
insert into public.body_measurements (user_id, measurement_type, value, unit, measured_at)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'weight', 90, 'kg', now());
insert into public.alcohol_logs (user_id, logged_at, drink_name, volume_ml, abv_percent, calories, units)
values ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', now(), 'Wine', 175, 13, 150, 2.28);

-- A helper that sums a user's rows across every one of the 27 user-owned tables. Zero after
-- deletion means no table leaked; the pre-delete sanity check confirms every table was
-- seeded (27 = one row each).
create or replace function pg_temp.count_user_rows(p uuid) returns bigint language sql as $fn$
  select
    (select count(*) from public.profiles where user_id = p)
  + (select count(*) from public.goals where user_id = p)
  + (select count(*) from public.health_context where user_id = p)
  + (select count(*) from public.training_plans where user_id = p)
  + (select count(*) from public.plan_weeks where user_id = p)
  + (select count(*) from public.workout_templates where user_id = p)
  + (select count(*) from public.workout_template_exercises where user_id = p)
  + (select count(*) from public.scheduled_sessions where user_id = p)
  + (select count(*) from public.readiness_checkins where user_id = p)
  + (select count(*) from public.workout_logs where user_id = p)
  + (select count(*) from public.exercise_logs where user_id = p)
  + (select count(*) from public.set_logs where user_id = p)
  + (select count(*) from public.progression_proposals where user_id = p)
  + (select count(*) from public.running_progression_proposals where user_id = p)
  + (select count(*) from public.cardio_templates where user_id = p)
  + (select count(*) from public.cardio_interval_steps where user_id = p)
  + (select count(*) from public.cardio_logs where user_id = p)
  + (select count(*) from public.nutrition_targets where user_id = p)
  + (select count(*) from public.foods where user_id = p)
  + (select count(*) from public.meal_templates where user_id = p)
  + (select count(*) from public.meal_template_items where user_id = p)
  + (select count(*) from public.nutrition_logs where user_id = p)
  + (select count(*) from public.alcohol_logs where user_id = p)
  + (select count(*) from public.drink_favourites where user_id = p)
  + (select count(*) from public.body_measurements where user_id = p)
  + (select count(*) from public.weekly_reviews where user_id = p)
  + (select count(*) from public.audit_events where user_id = p);
$fn$;

-- Seed sanity: one row in each of the 27 tables.
select is(pg_temp.count_user_rows('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 27::bigint,
  'user A is seeded with a row in every one of the 27 user-owned tables');

-- === Delete account A as A ==================================================
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.delete_account();

-- Inspect as superuser again (bypass RLS) to see the whole table state.
reset role;

-- === Cascade completeness: every owned table empty for A ====================
select is(pg_temp.count_user_rows('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0::bigint,
  'after deletion every one of the 27 user-owned tables is empty for that user');

-- The deepest FK-chain children individually, so a leak is diagnosable, not just summed away.
select is((select count(*)::integer from public.set_logs
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'set_logs (deepest workout child) cascaded');
select is((select count(*)::integer from public.exercise_logs
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'exercise_logs cascaded');
select is((select count(*)::integer from public.meal_template_items
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'meal_template_items cascaded');
select is((select count(*)::integer from public.cardio_interval_steps
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'cardio_interval_steps cascaded');
select is((select count(*)::integer from public.audit_events
           where user_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'audit_events (personal-data audit rows) are deleted too (docs/05 §5.11)');

-- The auth.users row itself is gone.
select is((select count(*)::integer from auth.users
           where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 0,
  'the auth.users row is deleted');

-- === Isolation: user B is wholly untouched ==================================
select is(pg_temp.count_user_rows('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 3::bigint,
  'a second user''s rows are entirely untouched by the deletion');
select is((select count(*)::integer from public.profiles
           where user_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 1,
  'the other user''s profile survives');

-- === Anonymous cannot execute ==============================================
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$ select public.delete_account() $$,
  '42501',
  'permission denied for function delete_account',
  'anonymous users cannot delete an account'
);

select * from finish();
rollback;
