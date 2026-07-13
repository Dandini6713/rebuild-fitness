begin;

create extension if not exists pgtap with schema extensions;

select plan(18);

-- Two users, so owner isolation can be checked. A minimal plan and week for the first
-- user let us assert that the replacement carries over the original's plan_week_id.
insert into auth.users (id, email)
values
  ('55555555-5555-4555-8555-555555555555', 'sub-user@example.invalid'),
  ('66666666-6666-4666-8666-666666666666', 'other-user@example.invalid');

insert into public.training_plans (id, user_id, name, starts_on, status)
values ('b0000000-0000-4000-8000-0000000000b1'::uuid, '55555555-5555-4555-8555-555555555555',
        'Rebuild base plan', current_date, 'active');

insert into public.plan_weeks (id, user_id, training_plan_id, week_number, starts_on)
values ('c0000000-0000-4000-8000-0000000000c1'::uuid, '55555555-5555-4555-8555-555555555555',
        'b0000000-0000-4000-8000-0000000000b1'::uuid, 1, current_date);

-- First user's sessions: gated (running / strength) planned ones to substitute, an
-- already-'replaced' one (the double-substitution guard), and a non-gated cardio one.
insert into public.scheduled_sessions (id, user_id, plan_week_id, scheduled_date, session_type, status)
values
  ('a0000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555',
   'c0000000-0000-4000-8000-0000000000c1'::uuid, current_date, 'running', 'planned'),
  ('a0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555',
   'c0000000-0000-4000-8000-0000000000c1'::uuid, current_date, 'strength', 'planned'),
  ('a0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555',
   'c0000000-0000-4000-8000-0000000000c1'::uuid, current_date, 'strength', 'replaced'),
  ('a0000000-0000-4000-8000-000000000004', '55555555-5555-4555-8555-555555555555',
   'c0000000-0000-4000-8000-0000000000c1'::uuid, current_date, 'cardio', 'planned'),
  ('a0000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555',
   'c0000000-0000-4000-8000-0000000000c1'::uuid, current_date, 'strength', 'planned');

-- Second user's session (isolation): the first user must not be able to substitute it.
insert into public.scheduled_sessions (id, user_id, scheduled_date, session_type, status)
values
  ('a0000000-0000-4000-8000-0000000000ff', '66666666-6666-4666-8666-666666666666',
   current_date, 'running', 'planned');

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Substitute the running session with easy cycling (a 'cardio'-typed replacement, the
-- specific activity captured in the reason). Store the returned id for later assertions.
create temporary table sub_result as
select public.substitute_session(
  'a0000000-0000-4000-8000-000000000001',
  'cardio',
  null,
  'Amber readiness result — replaced running with easy cycling.',
  true
) as new_id;

select isnt(
  (select new_id from sub_result),
  null,
  'substituting a running session returns the new replacement id'
);

-- The original is preserved and marked replaced (never edited away).
select is(
  (select status::text from public.scheduled_sessions
   where id = 'a0000000-0000-4000-8000-000000000001'),
  'replaced',
  'the original session is preserved and marked replaced'
);

-- Exactly one linked replacement was created.
select is(
  (select count(*)::integer from public.scheduled_sessions
   where replacement_for_id = 'a0000000-0000-4000-8000-000000000001'),
  1,
  'exactly one linked replacement is created for the original'
);

-- The replacement is a planned 'cardio' session on the same date and plan week, with
-- the back-link, the user source, the reason and the next-morning flag.
select is(
  (select session_type from public.scheduled_sessions where id = (select new_id from sub_result)),
  'cardio',
  'the replacement is a cardio-typed session'
);
select is(
  (select status::text from public.scheduled_sessions where id = (select new_id from sub_result)),
  'planned',
  'the replacement is planned'
);
select is(
  (select source from public.scheduled_sessions where id = (select new_id from sub_result)),
  'user',
  'the replacement is sourced as a user action'
);
select is(
  (select scheduled_date from public.scheduled_sessions where id = (select new_id from sub_result)),
  current_date,
  'the replacement keeps the original scheduled date'
);
select is(
  (select plan_week_id from public.scheduled_sessions where id = (select new_id from sub_result)),
  'c0000000-0000-4000-8000-0000000000c1'::uuid,
  'the replacement keeps the original plan week'
);
select is(
  (select reschedule_reason from public.scheduled_sessions where id = (select new_id from sub_result)),
  'Amber readiness result — replaced running with easy cycling.',
  'the replacement records the substitution reason'
);
select is(
  (select next_morning_check_expected from public.scheduled_sessions where id = (select new_id from sub_result)),
  true,
  'a next-morning check is expected on the replacement'
);

-- Guard: substituting the now-'replaced' original fails cleanly and creates no second row.
select throws_like(
  $$ select public.substitute_session('a0000000-0000-4000-8000-000000000001', 'rest', null, 'again', true) $$,
  '%only a planned session can be substituted%',
  'substituting an already-replaced session fails cleanly'
);
select is(
  (select count(*)::integer from public.scheduled_sessions
   where replacement_for_id = 'a0000000-0000-4000-8000-000000000001'),
  1,
  'a failed re-substitution creates no second replacement'
);

-- An invalid new type is rejected.
select throws_like(
  $$ select public.substitute_session('a0000000-0000-4000-8000-000000000002', 'swimming', null, 'nope', true) $$,
  '%new type must be cardio or rest%',
  'an invalid substitution type is rejected'
);

-- A non-gated session (cardio) cannot be substituted through this amber path.
select throws_like(
  $$ select public.substitute_session('a0000000-0000-4000-8000-000000000004', 'rest', null, 'nope', true) $$,
  '%only running or strength sessions can be substituted%',
  'a non-gated cardio session cannot be substituted'
);

-- A rest substitution creates a 'rest'-typed replacement; opting out of the next-morning
-- check leaves the flag false. Called once into a temp table (the function is volatile,
-- so it must not sit in a WHERE clause where it would be evaluated per row).
create temporary table sub_rest as
select public.substitute_session(
  'a0000000-0000-4000-8000-000000000005', 'rest', null,
  'Amber readiness result — taking a rest day.', false
) as new_id;

select is(
  (select session_type from public.scheduled_sessions where id = (select new_id from sub_rest)),
  'rest',
  'a rest substitution creates a rest-typed replacement'
);
select is(
  (select next_morning_check_expected from public.scheduled_sessions where id = (select new_id from sub_rest)),
  false,
  'the next-morning check can be opted out of'
);

-- Owner isolation: the first user cannot substitute the second user's session; it is
-- simply not visible under row-level security.
select throws_like(
  $$ select public.substitute_session('a0000000-0000-4000-8000-0000000000ff', 'rest', null, 'nope', true) $$,
  '%scheduled session not found for this user%',
  'a user cannot substitute another user''s session'
);

-- The anonymous role cannot substitute a session at all.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$ select public.substitute_session('a0000000-0000-4000-8000-000000000002', 'rest', null, 'nope', true) $$,
  '42501',
  'permission denied for function substitute_session',
  'anonymous users cannot substitute a session'
);

select * from finish();
rollback;
