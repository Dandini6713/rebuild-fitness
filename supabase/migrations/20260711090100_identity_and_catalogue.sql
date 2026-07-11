-- Identity, user context and curated workout catalogue.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  date_of_birth date,
  sex_for_calculation text,
  height_cm numeric(5, 2) check (height_cm between 100 and 250),
  timezone text not null default 'Europe/London',
  preferred_weight_unit text not null default 'kg',
  preferred_distance_unit text not null default 'km',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_type text not null,
  start_value numeric,
  target_value numeric,
  target_date date,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.health_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_type text not null,
  body_area text,
  description text check (char_length(description) <= 2000),
  professional_restrictions text check (char_length(professional_restrictions) <= 2000),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  category text not null,
  movement_pattern text,
  body_region text,
  equipment text,
  beginner_setup text,
  execution_steps text,
  common_mistakes text,
  stop_criteria text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  session_type text not null,
  estimated_minutes integer check (estimated_minutes between 1 and 300),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint workout_templates_system_owner_check check (
    (is_system and user_id is null) or (not is_system and user_id is not null)
  ),
  unique (id, user_id)
);

create table if not exists public.workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  template_id uuid not null,
  exercise_id uuid not null references public.exercises(id),
  exercise_order integer not null check (exercise_order > 0),
  target_sets integer not null check (target_sets between 1 and 10),
  rep_min integer check (rep_min is null or rep_min > 0),
  rep_max integer check (rep_max is null or rep_max >= rep_min),
  rest_seconds integer check (rest_seconds is null or rest_seconds >= 0),
  substitution_group text,
  created_at timestamptz not null default now(),
  unique (template_id, exercise_order),
  foreign key (template_id, user_id) references public.workout_templates(id, user_id) on delete cascade
);
