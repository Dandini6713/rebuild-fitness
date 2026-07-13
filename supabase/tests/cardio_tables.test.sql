begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

-- Roadmap 16: the three cardio tables (owner isolation, the composite user_id FK
-- behaviour) and the nine-stage seed (seed_cardio_stages: counts and durations).

insert into auth.users (id, email)
values
  ('77777777-7777-4777-8777-777777777777', 'cardio-user-a@example.invalid'),
  ('88888888-8888-4888-8888-888888888888', 'cardio-user-b@example.invalid');

-- === Stage seed: run as user A =============================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '77777777-7777-4777-8777-777777777777', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select public.seed_cardio_stages()),
  9,
  'seed_cardio_stages seeds nine run-walk stages'
);

-- Idempotent: a second call is a no-op that seeds nothing more.
select is(
  (select public.seed_cardio_stages()),
  0,
  'seed_cardio_stages is idempotent (a repeat call seeds nothing)'
);

select is(
  (select count(*)::integer from public.cardio_templates
   where user_id = '77777777-7777-4777-8777-777777777777' and stage_number is not null),
  9,
  'exactly nine staged cardio templates exist for the user'
);

-- Stage 1: warm-up + (run 60 / walk 120) x8 + cool-down = 18 steps.
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777' and t.stage_number = 1),
  18,
  'stage 1 has eighteen steps (warm-up + 8 run + 8 walk + cool-down)'
);

select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 1 and s.activity_type = 'run' and s.duration_seconds = 60),
  8,
  'stage 1 has eight 60-second run steps'
);

select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 1 and s.activity_type = 'walk' and s.duration_seconds = 120),
  8,
  'stage 1 has eight 120-second walk steps'
);

-- Stage 2: run 90 / walk 120 x8.
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 2 and s.activity_type = 'run' and s.duration_seconds = 90),
  8,
  'stage 2 has eight 90-second run steps'
);

-- Stage 3: run 120 / walk 120 x7.
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 3 and s.activity_type = 'run'),
  7,
  'stage 3 has seven run steps'
);

-- Stage 7: run 720 / walk 120 x2.
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 7 and s.activity_type = 'run' and s.duration_seconds = 720),
  2,
  'stage 7 has two 720-second run steps'
);

-- Stage 8: continuous 20-minute run (1200s), no walk steps.
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 8 and s.activity_type = 'run' and s.duration_seconds = 1200),
  1,
  'stage 8 is a single 1200-second (20 minute) continuous run'
);
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 8 and s.activity_type = 'walk'),
  0,
  'stage 8 has no walk steps'
);

-- Stage 9: continuous 25-minute run (1500s).
select is(
  (select count(*)::integer
   from public.cardio_interval_steps s
   join public.cardio_templates t on t.id = s.cardio_template_id
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and t.stage_number = 9 and s.activity_type = 'run' and s.duration_seconds = 1500),
  1,
  'stage 9 is a single 1500-second (25 minute) continuous run'
);

-- Every stage starts with a 300s warm-up and ends with a 300s cool-down.
select is(
  (select count(distinct stage_number)::integer
   from public.cardio_templates t
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and exists (
       select 1 from public.cardio_interval_steps s
       where s.cardio_template_id = t.id and s.activity_type = 'warmup' and s.duration_seconds = 300
     )),
  9,
  'every stage has a 300-second warm-up'
);
select is(
  (select count(distinct stage_number)::integer
   from public.cardio_templates t
   where t.user_id = '77777777-7777-4777-8777-777777777777'
     and exists (
       select 1 from public.cardio_interval_steps s
       where s.cardio_template_id = t.id and s.activity_type = 'cooldown' and s.duration_seconds = 300
     )),
  9,
  'every stage has a 300-second cool-down'
);

-- === A cardio log with the composite FK and owner isolation =================

-- A scheduled cardio session and a cardio log for user A.
insert into public.scheduled_sessions (id, user_id, scheduled_date, session_type, status)
values ('d0000000-0000-4000-8000-0000000000d1', '77777777-7777-4777-8777-777777777777',
        current_date, 'cardio', 'planned');

insert into public.cardio_logs (id, user_id, scheduled_session_id, started_at, status)
values ('e0000000-0000-4000-8000-0000000000e1', '77777777-7777-4777-8777-777777777777',
        'd0000000-0000-4000-8000-0000000000d1', now(), 'in_progress');

select is(
  (select count(*)::integer from public.cardio_logs
   where user_id = '77777777-7777-4777-8777-777777777777'),
  1,
  'user A can insert their own cardio log'
);

-- The composite (scheduled_session_id, user_id) FK sets the link to null on delete,
-- rather than deleting the log (mirroring workout_logs).
delete from public.scheduled_sessions where id = 'd0000000-0000-4000-8000-0000000000d1';
select is(
  (select scheduled_session_id from public.cardio_logs
   where id = 'e0000000-0000-4000-8000-0000000000e1'),
  null,
  'deleting the scheduled session nulls the cardio log link (log survives)'
);

-- === Owner isolation: user B ================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', '88888888-8888-4888-8888-888888888888', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.cardio_templates),
  0,
  'user B cannot see user A''s cardio templates'
);
select is(
  (select count(*)::integer from public.cardio_interval_steps),
  0,
  'user B cannot see user A''s interval steps'
);
select is(
  (select count(*)::integer from public.cardio_logs),
  0,
  'user B cannot see user A''s cardio logs'
);

-- User B cannot write a cardio log owned by user A (RLS with check).
select throws_ok(
  $$ insert into public.cardio_logs (user_id, started_at) values ('77777777-7777-4777-8777-777777777777', now()) $$,
  '42501',
  'new row violates row-level security policy for table "cardio_logs"',
  'user B cannot insert a cardio log owned by user A'
);

-- === Anonymous role ==========================================================

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select public.seed_cardio_stages() $$,
  '42501',
  'permission denied for function seed_cardio_stages',
  'anonymous users cannot seed cardio stages'
);
select throws_ok(
  $$ select count(*) from public.cardio_templates $$,
  '42501',
  'permission denied for table cardio_templates',
  'anonymous users cannot read cardio templates'
);

select * from finish();
rollback;
