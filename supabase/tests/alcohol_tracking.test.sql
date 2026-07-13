begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Roadmap 20: drink_favourites (owner isolation, the composite (id, user_id) key
-- convention, cross-user RLS block, anon denial) and the nullable profiles personal
-- weekly unit limit. alcohol_logs itself already has RLS coverage in rls_policies.test.sql.

insert into auth.users (id, email)
values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'drink-user-a@example.invalid'),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'drink-user-b@example.invalid');

-- === User A ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A profiles row (as onboarding would create) for the limit checks below.
insert into public.profiles (user_id, display_name)
values ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'A');

-- The weekly limit is NULLABLE with no invented default: a fresh profile has no limit.
select is(
  (select weekly_alcohol_unit_limit from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  null,
  'profiles.weekly_alcohol_unit_limit defaults to null (no invented limit)'
);

-- The owner can set their own limit, and it reads back.
update public.profiles set weekly_alcohol_unit_limit = 14
where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
select is(
  (select weekly_alcohol_unit_limit from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  14.00::numeric,
  'the owner can set their own weekly alcohol unit limit'
);

-- A saved drink favourite.
insert into public.drink_favourites
  (id, user_id, drink_name, drink_type, volume_ml, abv_percent, calories)
values
  ('d1000000-0000-4000-8000-0000000000d1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
   'Pint of lager', 'Beer', 568, 5, 215);

select is(
  (select count(*)::integer from public.drink_favourites
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  1,
  'user A can insert their own drink favourite'
);

-- The composite (id, user_id) key convention (ready for composite foreign keys, like the
-- workout/cardio/meal tables) is present.
select is(
  (select count(*)::integer
   from pg_constraint
   where conrelid = 'public.drink_favourites'::regclass
     and contype = 'u'
     and pg_get_constraintdef(oid) = 'UNIQUE (id, user_id)'),
  1,
  'drink_favourites carries the composite (id, user_id) unique key convention'
);

-- === User B ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.drink_favourites),
  0,
  'user B cannot see user A''s drink favourites'
);

-- User B cannot create a favourite owned by user A (RLS with check).
select throws_ok(
  $$ insert into public.drink_favourites
       (user_id, drink_name, volume_ml, abv_percent, calories)
     values ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Sneaky', 500, 5, 200) $$,
  '42501',
  'new row violates row-level security policy for table "drink_favourites"',
  'user B cannot insert a drink favourite owned by user A'
);

-- User B can create and read their own favourite (owner isolation is symmetric).
insert into public.drink_favourites
  (user_id, drink_name, volume_ml, abv_percent, calories)
values ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'B''s wine', 175, 13, 160);
select is(
  (select count(*)::integer from public.drink_favourites),
  1,
  'user B sees only their own drink favourite'
);

-- === Anonymous role ========================================================

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select count(*) from public.drink_favourites $$,
  '42501',
  'permission denied for table drink_favourites',
  'anonymous users cannot read drink favourites'
);

select * from finish();
rollback;
