begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- The seed references the exercise catalogue by slug. `supabase test db` does
-- not load seed.sql, so insert the twelve exercises the templates need first.
-- This runs as the migration superuser, before we drop to the authenticated
-- role, so row-level security does not block the setup.
insert into public.exercises (slug, name, category)
values
  ('leg-press', 'Leg press', 'strength'),
  ('machine-chest-press', 'Machine chest press', 'strength'),
  ('seated-cable-row', 'Seated cable row', 'strength'),
  ('dumbbell-rdl', 'Dumbbell Romanian deadlift', 'strength'),
  ('standing-calf-raise', 'Standing calf raise', 'strength'),
  ('dead-bug', 'Dead bug', 'core'),
  ('low-step-up', 'Low step-up', 'strength'),
  ('lat-pulldown', 'Lat pulldown', 'strength'),
  ('machine-shoulder-press', 'Machine shoulder press', 'strength'),
  ('glute-bridge', 'Glute bridge', 'strength'),
  ('seated-calf-raise', 'Seated calf raise', 'strength'),
  ('farmer-carry', 'Farmer carry', 'strength')
on conflict (slug) do nothing;

insert into auth.users (id, email)
values
  ('11111111-1111-4111-8111-111111111111', 'seed-user-a@example.invalid'),
  ('22222222-2222-4222-8222-222222222222', 'seed-user-b@example.invalid');

-- Records each seed call so we can compare the plan ids it returned.
create temporary table seed_runs (
  step text primary key,
  plan_id uuid not null
) on commit drop;

grant select, insert on table seed_runs to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- First seed.
insert into seed_runs (step, plan_id)
values ('first', public.seed_private_plan('2026-08-03'::date, false));

select isnt(
  (select plan_id from seed_runs where step = 'first'),
  null,
  'seeding returns the new plan id'
);

select is(
  (select count(*)::integer from public.training_plans
   where user_id = '11111111-1111-4111-8111-111111111111' and status = 'active'),
  1,
  'the user has exactly one active plan after seeding'
);

select is(
  (select count(*)::integer from public.plan_weeks
   where training_plan_id = (select plan_id from seed_runs where step = 'first')),
  12,
  'the plan has twelve weeks'
);

select is(
  (select count(*)::integer from public.scheduled_sessions s
   join public.plan_weeks w on w.id = s.plan_week_id
   where w.training_plan_id = (select plan_id from seed_runs where step = 'first')),
  84,
  'the plan has eighty-four scheduled sessions (7 x 12)'
);

select is(
  (select count(*)::integer from public.scheduled_sessions s
   join public.plan_weeks w on w.id = s.plan_week_id
   where w.training_plan_id = (select plan_id from seed_runs where step = 'first')
     and s.session_type = 'strength' and s.template_id is not null),
  24,
  'every strength session is template-backed (2 x 12)'
);

select is(
  (select count(*)::integer from public.scheduled_sessions s
   join public.plan_weeks w on w.id = s.plan_week_id
   where w.training_plan_id = (select plan_id from seed_runs where step = 'first')
     and s.session_type = 'rest'),
  12,
  'there is one rest session per week'
);

select is(
  (select count(*)::integer from public.workout_templates
   where user_id = '11111111-1111-4111-8111-111111111111' and not is_system),
  2,
  'exactly two reusable templates are created'
);

select is(
  (select count(*)::integer from public.workout_template_exercises
   where user_id = '11111111-1111-4111-8111-111111111111'),
  12,
  'the two templates hold twelve exercises in total'
);

-- Second seed with no reset must be an idempotent no-op.
insert into seed_runs (step, plan_id)
values ('second', public.seed_private_plan('2026-08-03'::date, false));

select is(
  (select count(*)::integer from public.training_plans
   where user_id = '11111111-1111-4111-8111-111111111111' and status = 'active'),
  1,
  're-seeding without reset does not create a second plan'
);

select is(
  (select plan_id from seed_runs where step = 'second'),
  (select plan_id from seed_runs where step = 'first'),
  're-seeding returns the same existing plan'
);

select is(
  (select count(*)::integer from public.workout_templates
   where user_id = '11111111-1111-4111-8111-111111111111' and not is_system),
  2,
  're-seeding does not duplicate the templates'
);

-- Reset must delete and recreate, still leaving exactly one plan.
insert into seed_runs (step, plan_id)
values ('reset', public.seed_private_plan('2026-08-10'::date, true));

select is(
  (select count(*)::integer from public.training_plans
   where user_id = '11111111-1111-4111-8111-111111111111' and status = 'active'),
  1,
  'a reset still leaves exactly one active plan'
);

select isnt(
  (select plan_id from seed_runs where step = 'reset'),
  (select plan_id from seed_runs where step = 'first'),
  'a reset recreates the plan under a new id'
);

select is(
  (select count(*)::integer from public.scheduled_sessions s
   join public.plan_weeks w on w.id = s.plan_week_id
   where w.training_plan_id = (select plan_id from seed_runs where step = 'reset')),
  84,
  'the reset plan is fully rebuilt with eighty-four sessions'
);

-- Counting every row the user owns (not just the current plan's) proves a reset
-- leaves nothing behind: sessions are not cascaded from the plan, so the old
-- ones must be deleted explicitly rather than orphaned.
select is(
  (select count(*)::integer from public.plan_weeks
   where user_id = '11111111-1111-4111-8111-111111111111'),
  12,
  'a reset leaves exactly twelve weeks for the user in total'
);

select is(
  (select count(*)::integer from public.scheduled_sessions
   where user_id = '11111111-1111-4111-8111-111111111111'),
  84,
  'a reset leaves exactly eighty-four sessions for the user in total (no orphans)'
);

-- Isolation: user B seeds their own plan without touching user A, and user A
-- only ever sees their own plan through row-level security.
select set_config('request.jwt.claim.sub', '22222222-2222-4222-8222-222222222222', true);
select public.seed_private_plan('2026-08-03'::date, false);

select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select is(
  (select count(*)::integer from public.training_plans),
  1,
  'a user cannot see another user''s seeded plan'
);

-- The anonymous role must not be able to seed at all.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select public.seed_private_plan('2026-08-03'::date, false) $$,
  '42501',
  'permission denied for function seed_private_plan',
  'anonymous users cannot seed a plan'
);

select * from finish();
rollback;
