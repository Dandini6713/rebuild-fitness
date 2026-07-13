begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

-- Roadmap 19: the two meal-template tables (owner isolation, the composite user_id FK
-- behaviour, cascade on parent delete, food link null-on-delete) and anon denial.

insert into auth.users (id, email)
values
  ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'meal-user-a@example.invalid'),
  ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', 'meal-user-b@example.invalid');

-- === User A ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

-- A saved food (for the optional food_id link) and a meal template.
insert into public.foods (id, user_id, name, calories, protein_g)
values ('f0000000-0000-4000-8000-0000000000f1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        'Porridge', 180, 6);

insert into public.meal_templates (id, user_id, name)
values ('c0000000-0000-4000-8000-0000000000c1', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        'Usual breakfast');

select is(
  (select count(*)::integer from public.meal_templates
   where user_id = 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1'),
  1,
  'user A can insert their own meal template'
);

-- Two items: one linked to the saved food, one inline (no food_id).
insert into public.meal_template_items
  (id, user_id, meal_template_id, food_id, description, serving_quantity, calories, protein_g)
values
  ('11110000-0000-4000-8000-000000000001', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
   'c0000000-0000-4000-8000-0000000000c1', 'f0000000-0000-4000-8000-0000000000f1',
   'Porridge', 1, 180, 6),
  ('11110000-0000-4000-8000-000000000002', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
   'c0000000-0000-4000-8000-0000000000c1', null,
   'Banana', 1, 90, 1);

select is(
  (select count(*)::integer from public.meal_template_items
   where meal_template_id = 'c0000000-0000-4000-8000-0000000000c1'),
  2,
  'user A can insert items (linked and inline) under their template'
);

-- Deleting the linked food nulls the item's food_id (on delete set null), keeping the
-- item and its inline snapshot.
delete from public.foods where id = 'f0000000-0000-4000-8000-0000000000f1';
select is(
  (select food_id from public.meal_template_items
   where id = '11110000-0000-4000-8000-000000000001'),
  null,
  'deleting the linked food nulls the item food_id (item survives)'
);

-- Deleting the parent template cascades its items away.
delete from public.meal_templates where id = 'c0000000-0000-4000-8000-0000000000c1';
select is(
  (select count(*)::integer from public.meal_template_items
   where meal_template_id = 'c0000000-0000-4000-8000-0000000000c1'),
  0,
  'deleting the meal template cascades its items'
);

-- Re-create a template for the cross-user checks below.
insert into public.meal_templates (id, user_id, name)
values ('c0000000-0000-4000-8000-0000000000c2', 'a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1',
        'Post-workout');

-- === User B ================================================================

set local role authenticated;
select set_config('request.jwt.claim.sub', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (select count(*)::integer from public.meal_templates),
  0,
  'user B cannot see user A''s meal templates'
);
select is(
  (select count(*)::integer from public.meal_template_items),
  0,
  'user B cannot see user A''s meal template items'
);

-- User B cannot create a template owned by user A (RLS with check).
select throws_ok(
  $$ insert into public.meal_templates (user_id, name)
     values ('a1a1a1a1-a1a1-4a1a-8a1a-a1a1a1a1a1a1', 'Sneaky') $$,
  '42501',
  'new row violates row-level security policy for table "meal_templates"',
  'user B cannot insert a meal template owned by user A'
);

-- User B cannot attach an item (as themselves) to user A's template: the composite
-- (meal_template_id, user_id) FK has no matching row for (A''s template, B).
select throws_ok(
  $$ insert into public.meal_template_items
       (user_id, meal_template_id, description, calories, protein_g)
     values ('b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
             'c0000000-0000-4000-8000-0000000000c2', 'Stolen', 100, 5) $$,
  '23503',
  null,
  'user B cannot attach an item to user A''s template (composite FK blocks it)'
);

-- User B can create and read their own template (owner isolation is symmetric).
insert into public.meal_templates (id, user_id, name)
values ('d0000000-0000-4000-8000-0000000000d2', 'b2b2b2b2-b2b2-4b2b-8b2b-b2b2b2b2b2b2',
        'B''s meal');
select is(
  (select count(*)::integer from public.meal_templates),
  1,
  'user B sees only their own meal template'
);

-- === Anonymous role ========================================================

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select count(*) from public.meal_templates $$,
  '42501',
  'permission denied for table meal_templates',
  'anonymous users cannot read meal templates'
);
select throws_ok(
  $$ select count(*) from public.meal_template_items $$,
  '42501',
  'permission denied for table meal_template_items',
  'anonymous users cannot read meal template items'
);

select * from finish();
rollback;
