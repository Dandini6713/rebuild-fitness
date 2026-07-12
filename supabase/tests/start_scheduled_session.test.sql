begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

-- One user, and a scheduled session of each relevant type. scheduled_sessions needs
-- only user_id, a date and a type (plan_week_id and template_id are nullable), so we
-- can build the fixtures without a full seeded plan.
insert into auth.users (id, email)
values ('55555555-5555-4555-8555-555555555555', 'start-user@example.invalid');

insert into public.scheduled_sessions (id, user_id, scheduled_date, session_type)
values
  ('a0000000-0000-4000-8000-000000000001', '55555555-5555-4555-8555-555555555555', current_date, 'running'),
  ('a0000000-0000-4000-8000-000000000002', '55555555-5555-4555-8555-555555555555', current_date, 'strength'),
  ('a0000000-0000-4000-8000-000000000003', '55555555-5555-4555-8555-555555555555', current_date, 'running'),
  ('a0000000-0000-4000-8000-000000000004', '55555555-5555-4555-8555-555555555555', current_date, 'strength'),
  ('a0000000-0000-4000-8000-000000000005', '55555555-5555-4555-8555-555555555555', current_date, 'strength'),
  ('a0000000-0000-4000-8000-000000000006', '55555555-5555-4555-8555-555555555555', current_date, 'strength'),
  ('a0000000-0000-4000-8000-000000000007', '55555555-5555-4555-8555-555555555555', current_date, 'cardio'),
  ('a0000000-0000-4000-8000-000000000008', '55555555-5555-4555-8555-555555555555', current_date, 'achilles');

-- Pre-session readiness rows, inserted directly as the (superuser) test role so we can
-- set an explicit classification and created_at. In production these are only ever
-- written by submit_readiness_checkin; here they simulate what it stored. The block
-- reads the stored classification, so the raw answers below are illustrative only.
insert into public.readiness_checkins (
  user_id, scheduled_session_id, checkin_type, pain_score, stiffness_change,
  swelling_level, walking_status, sudden_change, confidence_score,
  classification, rule_version, created_at
)
values
  -- running + red  → blocked
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000001',
   'pre_session', 6, 'same', 'none', 'normal', false, 5, 'red', 'readiness/v1', now()),
  -- strength + red → blocked
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000002',
   'pre_session', 6, 'same', 'none', 'normal', false, 5, 'red', 'readiness/v1', now()),
  -- running + green → permitted
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000003',
   'pre_session', 0, 'same', 'none', 'normal', false, 5, 'green', 'readiness/v1', now()),
  -- strength + amber → permitted (amber warns, it does not block)
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000004',
   'pre_session', 3, 'same', 'none', 'normal', false, 5, 'amber', 'readiness/v1', now()),
  -- strength cleared: an earlier red superseded by a LATER green → permitted
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000006',
   'pre_session', 6, 'same', 'none', 'normal', false, 5, 'red', 'readiness/v1', now() - interval '2 hours'),
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000006',
   'pre_session', 0, 'same', 'none', 'normal', false, 5, 'green', 'readiness/v1', now() - interval '1 hour'),
  -- cardio + red → permitted (cardio is not a gated session type)
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000007',
   'pre_session', 6, 'same', 'none', 'normal', false, 5, 'red', 'readiness/v1', now()),
  -- achilles + red → permitted (achilles is recovery, not a gated session type)
  ('55555555-5555-4555-8555-555555555555', 'a0000000-0000-4000-8000-000000000008',
   'pre_session', 6, 'same', 'none', 'normal', false, 5, 'red', 'readiness/v1', now());
-- (session ...0005 deliberately has NO pre-session check.)

set local role authenticated;
select set_config('request.jwt.claim.sub', '55555555-5555-4555-8555-555555555555', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- Red blocks a running start and a strength (demanding lower-body) start. The block
-- carries the readiness-red-block marker so the client renders the red result.
select throws_like(
  $$ select public.start_scheduled_session('a0000000-0000-4000-8000-000000000001', now()) $$,
  '%readiness-red-block%',
  'a red pre-session result blocks a running start'
);
select throws_like(
  $$ select public.start_scheduled_session('a0000000-0000-4000-8000-000000000002', now()) $$,
  '%readiness-red-block%',
  'a red pre-session result blocks a strength (demanding lower-body) start'
);

-- Green and amber both permit the start (start returns the new log id).
select isnt(
  (select public.start_scheduled_session('a0000000-0000-4000-8000-000000000003', now())),
  null,
  'green permits a running start'
);
select isnt(
  (select public.start_scheduled_session('a0000000-0000-4000-8000-000000000004', now())),
  null,
  'amber permits a strength start (it warns, it does not block)'
);

-- No pre-session check at all permits the start: a session cannot be gated behind a
-- check the user was never asked to complete.
select isnt(
  (select public.start_scheduled_session('a0000000-0000-4000-8000-000000000005', now())),
  null,
  'a strength session with no pre-session check can still start'
);

-- Only the latest pre-session check counts: a later non-red check clears an earlier red.
select isnt(
  (select public.start_scheduled_session('a0000000-0000-4000-8000-000000000006', now())),
  null,
  'a later green clears an earlier red and permits the start'
);

-- The block applies only to running and demanding-lower-body sessions. Cardio and
-- achilles-day sessions are not blocked even with a red check.
select isnt(
  (select public.start_scheduled_session('a0000000-0000-4000-8000-000000000007', now())),
  null,
  'a cardio session is not blocked by a red readiness result'
);
select isnt(
  (select public.start_scheduled_session('a0000000-0000-4000-8000-000000000008', now())),
  null,
  'an achilles-day session is not blocked by a red readiness result'
);

-- A blocked start creates NO workout_logs row: the session never begins.
select is(
  (select count(*)::integer from public.workout_logs
   where scheduled_session_id in (
     'a0000000-0000-4000-8000-000000000001',
     'a0000000-0000-4000-8000-000000000002')),
  0,
  'a blocked start writes no workout_logs row'
);

-- A permitted start did create exactly one workout_logs row (via the definer function).
select is(
  (select count(*)::integer from public.workout_logs
   where scheduled_session_id = 'a0000000-0000-4000-8000-000000000003'),
  1,
  'a permitted start creates exactly one workout_logs row'
);

-- The revoked grant makes the RPC the ONLY way in: a direct client INSERT into
-- workout_logs is denied, so the readiness block cannot be bypassed.
select throws_ok(
  $$ insert into public.workout_logs (user_id, scheduled_session_id, started_at, status)
     values ('55555555-5555-4555-8555-555555555555',
             'a0000000-0000-4000-8000-000000000005', now(), 'in_progress') $$,
  '42501',
  'permission denied for table workout_logs',
  'a direct client INSERT into workout_logs is denied by the revoked grant'
);

-- The anonymous role cannot start a session at all.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$ select public.start_scheduled_session('a0000000-0000-4000-8000-000000000005', now()) $$,
  '42501',
  'permission denied for function start_scheduled_session',
  'anonymous users cannot start a scheduled session'
);

select * from finish();
rollback;
