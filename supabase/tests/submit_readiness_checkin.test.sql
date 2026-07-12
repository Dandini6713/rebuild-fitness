begin;

create extension if not exists pgtap with schema extensions;

select plan(17);

insert into auth.users (id, email)
values
  ('33333333-3333-4333-8333-333333333333', 'readiness-user-a@example.invalid'),
  ('44444444-4444-4444-8444-444444444444', 'readiness-user-b@example.invalid');

set local role authenticated;
select set_config('request.jwt.claim.sub', '33333333-3333-4333-8333-333333333333', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- The client passes raw answers only; the server computes the classification.
-- Representative green: pain 0, no symptoms.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 0, 'same', 'none', 'normal', false, 5)),
  'green',
  'calm answers classify green server-side'
);

-- Representative amber: pain 3.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 3, 'same', 'none', 'normal', false, 5)),
  'amber',
  'pain of 3 classifies amber server-side'
);

-- Amber: worse stiffness with low pain.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 1, 'worse', 'none', 'normal', false, 5)),
  'amber',
  'worse stiffness with pain 1 classifies amber'
);

-- Representative red: pain 6.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 6, 'same', 'none', 'normal', false, 5)),
  'red',
  'pain of 6 classifies red server-side'
);

-- Red: significant swelling even with otherwise-calm answers.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 1, 'same', 'significant', 'normal', false, 5)),
  'red',
  'significant swelling classifies red'
);

-- Red: sudden change.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 1, 'same', 'none', 'normal', true, 5)),
  'red',
  'a sudden change classifies red'
);

-- Boundary: altered walking with pain 4 is red; with pain 3 it is amber.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 4, 'same', 'none', 'altered', false, 5)),
  'red',
  'altered walking with pain 4 classifies red'
);
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 3, 'same', 'none', 'altered', false, 5)),
  'amber',
  'altered walking with pain 3 classifies amber'
);

-- Precedence: red overrides otherwise-amber values (mild swelling + low confidence)
-- when a red trigger (pain 6) is present.
select is(
  (select classification::text from public.submit_readiness_checkin(
    'pre_session', 6, 'same', 'mild', 'normal', false, 1)),
  'red',
  'red overrides amber values'
);

-- The row is actually written, owner-scoped, with the server classification, rule
-- version and structured reasons — never anything the caller supplied.
select is(
  (select count(*)::integer from public.readiness_checkins
   where user_id = '33333333-3333-4333-8333-333333333333'),
  9,
  'every accepted submission is stored for the owner'
);

select is(
  (select count(*)::integer from public.readiness_checkins
   where user_id = '33333333-3333-4333-8333-333333333333'
     and rule_version = 'readiness/v1'),
  9,
  'the server stamps the rule version on every row'
);

select is(
  (select count(*)::integer from public.readiness_checkins
   where user_id = '33333333-3333-4333-8333-333333333333'
     and jsonb_array_length(trigger_reasons) >= 1),
  9,
  'every stored row carries at least one structured trigger reason'
);

-- A caller cannot smuggle in a classification: the function has no classification
-- parameter at all, so a red set of answers can only ever be stored as red.
select is(
  (select count(*)::integer
   from information_schema.parameters
   where specific_schema = 'public'
     and specific_name like 'submit_readiness_checkin%'
     and parameter_name = 'p_classification'),
  0,
  'the function exposes no classification parameter to override'
);

-- The classification stored for a red set of answers is red regardless of intent.
select is(
  (select classification::text from public.readiness_checkins
   where user_id = '33333333-3333-4333-8333-333333333333'
     and pain_score = 6 and swelling_level = 'mild'
   limit 1),
  'red',
  'the stored classification is the server computation, not a client choice'
);

-- Invalid raw answers are rejected, not stored as some default classification.
select throws_ok(
  $$ select public.submit_readiness_checkin(
       'pre_session', 11, 'same', 'none', 'normal', false, 5) $$,
  '22003',
  'pain score must be between 0 and 10',
  'an out-of-range pain score is rejected rather than stored'
);

-- Isolation: user B cannot see user A's check-ins through row-level security.
select set_config('request.jwt.claim.sub', '44444444-4444-4444-8444-444444444444', true);
select public.submit_readiness_checkin(
  'pre_session', 0, 'same', 'none', 'normal', false, 5);
select is(
  (select count(*)::integer from public.readiness_checkins),
  1,
  'a user only sees their own check-ins'
);

-- The anonymous role must not be able to submit at all.
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);
select throws_ok(
  $$ select public.submit_readiness_checkin(
       'pre_session', 0, 'same', 'none', 'normal', false, 5) $$,
  '42501',
  'permission denied for function submit_readiness_checkin',
  'anonymous users cannot submit a readiness check-in'
);

select * from finish();
rollback;
