begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Roadmap 17: the dedicated running_progression_proposals table — owner isolation,
-- the owner-scoped grants (select/insert/update but NOT delete, matching the
-- strength progression_proposals table), the plan-week composite FK behaviour and
-- anon denial.

insert into auth.users (id, email)
values
  ('a1111111-1111-4111-8111-111111111111', 'run-user-a@example.invalid'),
  ('b2222222-2222-4222-8222-222222222222', 'run-user-b@example.invalid');

-- A minimal plan + week for user A, so the plan_week_id FK can be exercised.
insert into public.training_plans (id, user_id, name, starts_on, ends_on, status)
values ('c3333333-3333-4333-8333-333333333333', 'a1111111-1111-4111-8111-111111111111',
        'Test plan', current_date, current_date + 83, 'active');
insert into public.plan_weeks (id, user_id, training_plan_id, week_number, starts_on, status)
values ('d4444444-4444-4444-8444-444444444444', 'a1111111-1111-4111-8111-111111111111',
        'c3333333-3333-4333-8333-333333333333', 1, current_date, 'planned');

-- === User A ==================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.running_progression_proposals
  (id, user_id, from_stage_number, to_stage_number, plan_week_id, decision, rule_version)
values ('e5555555-5555-4555-8555-555555555555', 'a1111111-1111-4111-8111-111111111111',
        3, 4, 'd4444444-4444-4444-8444-444444444444', 'advance', 'running-progression/v1');

select is(
  (select count(*)::integer from public.running_progression_proposals
   where user_id = 'a1111111-1111-4111-8111-111111111111'),
  1,
  'user A can insert their own running progression proposal'
);

select is(
  (select decision from public.running_progression_proposals
   where id = 'e5555555-5555-4555-8555-555555555555'),
  'advance',
  'the stored decision is readable by its owner'
);

-- The owner can update the status (accept the proposal).
update public.running_progression_proposals
set status = 'accepted', decided_at = now()
where id = 'e5555555-5555-4555-8555-555555555555';
select is(
  (select status from public.running_progression_proposals
   where id = 'e5555555-5555-4555-8555-555555555555'),
  'accepted',
  'the owner can accept (update) their proposal'
);

-- Deleting the plan week nulls the link rather than dropping the proposal.
delete from public.plan_weeks where id = 'd4444444-4444-4444-8444-444444444444';
select is(
  (select plan_week_id from public.running_progression_proposals
   where id = 'e5555555-5555-4555-8555-555555555555'),
  null,
  'deleting the plan week nulls the proposal link (proposal survives)'
);

-- The owner has no DELETE grant: a proposal is a record, not something removable.
select throws_ok(
  $$ delete from public.running_progression_proposals where id = 'e5555555-5555-4555-8555-555555555555' $$,
  '42501',
  'permission denied for table running_progression_proposals',
  'the owner cannot delete a running progression proposal (no delete grant)'
);

-- === User B: owner isolation ================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2222222-2222-4222-8222-222222222222', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.running_progression_proposals),
  0,
  'user B cannot see user A''s running progression proposals'
);

select throws_ok(
  $$ insert into public.running_progression_proposals
       (user_id, from_stage_number, to_stage_number, decision, rule_version)
     values ('a1111111-1111-4111-8111-111111111111', 1, 2, 'advance', 'running-progression/v1') $$,
  '42501',
  'new row violates row-level security policy for table "running_progression_proposals"',
  'user B cannot insert a proposal owned by user A'
);

-- === Anonymous role =========================================================

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select count(*) from public.running_progression_proposals $$,
  '42501',
  'permission denied for table running_progression_proposals',
  'anonymous users cannot read running progression proposals'
);

select * from finish();
rollback;
