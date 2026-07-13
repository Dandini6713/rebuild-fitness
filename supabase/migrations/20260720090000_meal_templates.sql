-- Roadmap 19: reusable meal templates (docs/05 §5.7, docs/03 S-031 "Add saved meal").
--
-- nutrition_targets, foods and nutrition_logs all already exist with the right shape
-- and RLS (20260711090300 / 090500) and are NOT touched here. The one genuinely
-- missing piece is meal_templates — "reusable collections of foods and quantities" —
-- so a user can log a whole meal (say "usual breakfast") in one action rather than
-- adding each food every day.
--
-- A template is a PARENT row (a name) plus CHILD item rows, exactly like a workout
-- template and its exercises, because a meal is inherently a collection. Each item is
-- modelled on nutrition_logs: an optional food_id link PLUS its own inline
-- description and macros, so an item is self-contained and survives the linked food
-- being deleted or edited (the snapshot is what the template promised), mirroring how
-- nutrition_logs already carries both food_id and its own calories/protein. Logging a
-- template expands its items into individual nutrition_logs rows (in the feature
-- layer); the template itself stores no logs.
--
-- Both tables are owner-scoped and protected exactly as 20260711090500 protects the
-- rest, with the composite (id, user_id) foreign-key convention of the workout and
-- cardio tables so a child can never point at another user's parent.

-- 1. Tables -------------------------------------------------------------------

create table if not exists public.meal_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.meal_template_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  meal_template_id uuid not null,
  -- Optional link to a saved food. Nullable so an inline (custom) item needs no
  -- foods row, exactly like nutrition_logs.food_id. Set null (not cascade delete) if
  -- the food is later removed, so the item's own snapshot below still stands.
  food_id uuid,
  -- The inline snapshot: name and per-serving macros captured when the item was added
  -- to the template, so the template is stable even if the source food changes.
  description text not null check (char_length(description) between 1 and 200),
  serving_quantity numeric(8, 2) not null default 1 check (serving_quantity > 0),
  calories integer not null check (calories >= 0),
  protein_g numeric(6, 2) not null default 0 check (protein_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g is null or carbohydrate_g >= 0),
  fat_g numeric(6, 2) check (fat_g is null or fat_g >= 0),
  created_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (meal_template_id, user_id)
    references public.meal_templates(id, user_id) on delete cascade,
  foreign key (food_id, user_id)
    references public.foods(id, user_id) on delete set null (food_id)
);

-- 2. Indexes (consistent with 20260711090400) --------------------------------

create index if not exists meal_templates_user_created_idx
  on public.meal_templates (user_id, created_at desc);
create index if not exists meal_template_items_template_idx
  on public.meal_template_items (meal_template_id);
create index if not exists meal_template_items_user_created_idx
  on public.meal_template_items (user_id, created_at desc);

-- Keep updated_at current on the parent, reusing the shared trigger function
-- (20260711090400). meal_template_items is write-once (edit = delete + reinsert, like
-- cardio_interval_steps), so it has no updated_at and no trigger.
drop trigger if exists set_updated_at on public.meal_templates;
create trigger set_updated_at before update on public.meal_templates
  for each row execute function public.set_updated_at();

-- 3. Row-level security (following 20260711090500) -----------------------------

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'meal_templates',
    'meal_template_items'
  ]
  loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on table public.%I from public, anon', table_name);
  end loop;
end
$$;

grant select, insert, update, delete on table
  public.meal_templates,
  public.meal_template_items
to authenticated;

drop policy if exists "meal templates owner access" on public.meal_templates;
create policy "meal templates owner access" on public.meal_templates for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

drop policy if exists "meal template items owner access" on public.meal_template_items;
create policy "meal template items owner access" on public.meal_template_items for all to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
