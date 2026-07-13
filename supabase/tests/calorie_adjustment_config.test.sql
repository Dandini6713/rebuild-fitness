begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Roadmap 22: the two new profiles config columns (calorie_floor,
-- adaptive_adjustments_enabled) — defaults, constraints and owner-writability — and
-- weekly_reviews owner isolation (RLS-enabled/anon-denied is already covered generically in
-- rls_policies.test.sql, but explicit cross-user isolation was not, so it is added here).

insert into auth.users (id, email)
values
  ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'review-user-a@example.invalid'),
  ('d2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', 'review-user-b@example.invalid');

-- === User A ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.profiles (user_id, display_name)
values ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', 'A');

-- calorie_floor defaults to the conservative documented value (docs/06 §6.7).
select is(
  (select calorie_floor from public.profiles
   where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  1500,
  'profiles.calorie_floor defaults to the conservative 1500 kcal'
);

-- adaptive_adjustments_enabled defaults to true (the user opts in by default).
select is(
  (select adaptive_adjustments_enabled from public.profiles
   where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  true,
  'profiles.adaptive_adjustments_enabled defaults to true'
);

-- The owner can adjust their own floor and disable adaptive adjustments.
update public.profiles
  set calorie_floor = 1600, adaptive_adjustments_enabled = false
  where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1';
select is(
  (select calorie_floor from public.profiles
   where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  1600,
  'the owner can set their own calorie floor'
);
select is(
  (select adaptive_adjustments_enabled from public.profiles
   where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  false,
  'the owner can disable adaptive adjustments'
);

-- The floor must be positive (a zero or negative floor is nonsensical).
select throws_ok(
  $$ update public.profiles set calorie_floor = 0
     where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1' $$,
  '23514',
  null,
  'the calorie floor must be positive (check constraint)'
);

-- A weekly review the owner can read back.
insert into public.weekly_reviews
  (id, user_id, period_start, period_end, metrics, recommendations, rule_version)
values
  ('11111111-2222-4333-8444-555555555555', 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1',
   '2026-07-07', '2026-07-13', '{"adherence":{}}'::jsonb, '[]'::jsonb,
   'weekly-review/v1');

select is(
  (select count(*)::integer from public.weekly_reviews
   where user_id = 'c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1'),
  1,
  'user A can insert and read their own weekly review'
);

-- === User B ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'd2d2d2d2-d2d2-4d2d-8d2d-d2d2d2d2d2d2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- User B cannot see user A's weekly reviews.
select is(
  (select count(*)::integer from public.weekly_reviews),
  0,
  'user B cannot see user A''s weekly reviews'
);

-- User B cannot insert a weekly review owned by user A (RLS with check).
select throws_ok(
  $$ insert into public.weekly_reviews
       (user_id, period_start, period_end, metrics, recommendations, rule_version)
     values ('c1c1c1c1-c1c1-4c1c-8c1c-c1c1c1c1c1c1', '2026-07-14', '2026-07-20',
             '{}'::jsonb, '[]'::jsonb, 'weekly-review/v1') $$,
  '42501',
  'new row violates row-level security policy for table "weekly_reviews"',
  'user B cannot insert a weekly review owned by user A'
);

select * from finish();
rollback;
