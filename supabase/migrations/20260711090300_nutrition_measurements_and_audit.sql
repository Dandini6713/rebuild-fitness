-- Nutrition, alcohol, measurements, weekly reviews and audit history.

create table if not exists public.nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  calories integer not null check (calories between 1000 and 6000),
  protein_g numeric(6, 2) not null check (protein_g between 0 and 400),
  source text not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, effective_from)
);

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  serving_description text,
  calories integer not null check (calories >= 0),
  protein_g numeric(6, 2) not null default 0 check (protein_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g is null or carbohydrate_g >= 0),
  fat_g numeric(6, 2) check (fat_g is null or fat_g >= 0),
  favourite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create table if not exists public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid,
  logged_at timestamptz not null,
  meal_type text not null,
  description text not null,
  serving_quantity numeric(8, 2) not null default 1 check (serving_quantity > 0),
  calories integer not null check (calories >= 0),
  protein_g numeric(6, 2) not null default 0 check (protein_g >= 0),
  carbohydrate_g numeric(6, 2) check (carbohydrate_g is null or carbohydrate_g >= 0),
  fat_g numeric(6, 2) check (fat_g is null or fat_g >= 0),
  source text not null default 'custom',
  confidence numeric(4, 3) check (confidence is null or confidence between 0 and 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (food_id, user_id) references public.foods(id, user_id) on delete set null (food_id)
);

create table if not exists public.alcohol_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null,
  drink_name text not null,
  drink_type text,
  volume_ml numeric(8, 2) not null check (volume_ml > 0),
  abv_percent numeric(5, 2) not null check (abv_percent between 0 and 100),
  calories integer not null check (calories >= 0),
  units numeric(6, 2) not null check (units >= 0),
  occasion_note text check (char_length(occasion_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measurement_type public.measurement_type not null,
  value numeric(7, 2) not null check (value > 0),
  unit text not null,
  measured_at timestamptz not null,
  conditions_note text check (char_length(conditions_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.weekly_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  metrics jsonb not null,
  recommendations jsonb not null,
  rule_version text not null,
  accepted_changes jsonb,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, period_start, period_end),
  check (period_end >= period_start)
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
