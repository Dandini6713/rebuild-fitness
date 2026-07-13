begin;

create extension if not exists pgtap with schema extensions;

select plan(8);

-- Roadmap 24: the six notify_* preference columns on profiles — defaults (every type OFF,
-- opt-in), owner-writability, and owner isolation. Following calorie_adjustment_config's
-- shape; generic RLS-enabled/anon-denied is already covered in rls_policies.test.sql.

insert into auth.users (id, email)
values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'notify-user-a@example.invalid'),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'notify-user-b@example.invalid');

-- === User A ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.profiles (user_id, display_name)
values ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'A');

-- Every notification type defaults OFF (opt-in): the app never pings a user who has not
-- asked for it, and the OS permission must be granted separately.
select is(
  (select notify_sessions from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  false,
  'notify_sessions defaults off (opt-in)'
);
select is(
  (select notify_weigh_in from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  false,
  'notify_weigh_in defaults off (opt-in)'
);
select is(
  (select notify_waist from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  false,
  'notify_waist defaults off (opt-in)'
);
select is(
  (select notify_weekly_review from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  false,
  'notify_weekly_review defaults off (opt-in)'
);
select is(
  (select notify_readiness from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  false,
  'notify_readiness defaults off (opt-in)'
);
select is(
  (select notify_next_morning from public.profiles
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  false,
  'notify_next_morning defaults off (opt-in)'
);

-- The owner can turn a single type on without affecting the others (independently optional).
update public.profiles
  set notify_sessions = true
  where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
select is(
  (select notify_sessions and not notify_weigh_in and not notify_waist
     and not notify_weekly_review and not notify_readiness and not notify_next_morning
   from public.profiles where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  true,
  'turning one type on leaves the others off (independently optional)'
);

-- === User B ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.profiles (user_id, display_name)
values ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'B');

-- User B cannot see or change user A's preferences (RLS owner isolation): an update
-- scoped to A's id from B's session affects zero rows.
update public.profiles
  set notify_sessions = false
  where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1';
select is(
  (select count(*)::integer from public.profiles),
  1,
  'user B only sees their own profile row (owner isolation)'
);

select * from finish();
rollback;
