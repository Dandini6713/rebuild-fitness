-- Rebuild private MVP starter schema
-- Convert this reference file into ordered migrations before use.

create extension if not exists pgcrypto;

create type session_status as enum ('planned','in_progress','completed','skipped','replaced','cancelled');
create type readiness_classification as enum ('green','amber','red');
create type checkin_type as enum ('pre_session','post_session','next_morning');
create type measurement_type as enum ('weight','waist');

create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  date_of_birth date,
  sex_for_calculation text,
  height_cm numeric(5,2) check (height_cm between 100 and 250),
  timezone text not null default 'Europe/London',
  preferred_weight_unit text not null default 'kg',
  preferred_distance_unit text not null default 'km',
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists goals (
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

create table if not exists health_context (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  context_type text not null,
  body_area text,
  description text,
  professional_restrictions text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exercises (
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

create table if not exists workout_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  session_type text not null,
  estimated_minutes integer check (estimated_minutes between 1 and 300),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists workout_template_exercises (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references workout_templates(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  exercise_order integer not null,
  target_sets integer not null check (target_sets between 1 and 10),
  rep_min integer,
  rep_max integer,
  rest_seconds integer,
  substitution_group text,
  created_at timestamptz not null default now()
);

create table if not exists training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists plan_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_plan_id uuid not null references training_plans(id) on delete cascade,
  week_number integer not null,
  starts_on date not null,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(training_plan_id, week_number)
);

create table if not exists scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_week_id uuid references plan_weeks(id) on delete set null,
  template_id uuid references workout_templates(id) on delete set null,
  scheduled_date date not null,
  session_type text not null,
  status session_status not null default 'planned',
  source text not null default 'plan',
  replacement_for_id uuid references scheduled_sessions(id) on delete set null,
  reschedule_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_session_id uuid references scheduled_sessions(id) on delete set null,
  checkin_type checkin_type not null,
  pain_score integer not null check (pain_score between 0 and 10),
  stiffness_change text not null check (stiffness_change in ('better','same','worse')),
  swelling_level text not null check (swelling_level in ('none','mild','significant')),
  walking_status text not null check (walking_status in ('normal','altered')),
  sudden_change boolean not null,
  confidence_score integer not null check (confidence_score between 1 and 5),
  classification readiness_classification not null,
  rule_version text not null,
  trigger_reasons jsonb not null default '[]'::jsonb,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now()
);

create table if not exists workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_session_id uuid references scheduled_sessions(id) on delete set null,
  started_at timestamptz not null,
  completed_at timestamptz,
  status session_status not null default 'in_progress',
  session_effort integer check (session_effort between 1 and 10),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null references workout_logs(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  exercise_order integer not null,
  created_at timestamptz not null default now()
);

create table if not exists set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_log_id uuid not null references exercise_logs(id) on delete cascade,
  set_number integer not null,
  weight_kg numeric(6,2),
  repetitions integer,
  duration_seconds integer,
  effort_score integer check (effort_score between 1 and 10),
  discomfort_score integer check (discomfort_score between 0 and 10),
  completed_at timestamptz not null default now(),
  client_operation_id uuid unique,
  created_at timestamptz not null default now()
);

create table if not exists nutrition_targets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  effective_from date not null,
  calories integer not null check (calories between 1000 and 6000),
  protein_g numeric(6,2) not null check (protein_g between 0 and 400),
  source text not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists foods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  serving_description text,
  calories integer not null check (calories >= 0),
  protein_g numeric(6,2) not null default 0,
  carbohydrate_g numeric(6,2),
  fat_g numeric(6,2),
  favourite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  food_id uuid references foods(id) on delete set null,
  logged_at timestamptz not null,
  meal_type text not null,
  description text not null,
  serving_quantity numeric(8,2) not null default 1,
  calories integer not null check (calories >= 0),
  protein_g numeric(6,2) not null default 0,
  carbohydrate_g numeric(6,2),
  fat_g numeric(6,2),
  source text not null default 'custom',
  confidence numeric(4,3),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists alcohol_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null,
  drink_name text not null,
  drink_type text,
  volume_ml numeric(8,2) not null check (volume_ml > 0),
  abv_percent numeric(5,2) not null check (abv_percent between 0 and 100),
  calories integer not null check (calories >= 0),
  units numeric(6,2) not null check (units >= 0),
  occasion_note text check (char_length(occasion_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measurement_type measurement_type not null,
  value numeric(7,2) not null check (value > 0),
  unit text not null,
  measured_at timestamptz not null,
  conditions_note text check (char_length(conditions_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists weekly_reviews (
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
  unique(user_id, period_start, period_end)
);

create table if not exists audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists scheduled_sessions_user_date_idx on scheduled_sessions(user_id, scheduled_date);
create index if not exists readiness_checkins_user_created_idx on readiness_checkins(user_id, created_at desc);
create index if not exists nutrition_logs_user_logged_idx on nutrition_logs(user_id, logged_at desc);
create index if not exists alcohol_logs_user_logged_idx on alcohol_logs(user_id, logged_at desc);
create index if not exists body_measurements_user_measured_idx on body_measurements(user_id, measured_at desc);

-- RLS helper pattern. Apply to every user-owned table.
alter table profiles enable row level security;
alter table goals enable row level security;
alter table health_context enable row level security;
alter table training_plans enable row level security;
alter table plan_weeks enable row level security;
alter table scheduled_sessions enable row level security;
alter table readiness_checkins enable row level security;
alter table workout_logs enable row level security;
alter table exercise_logs enable row level security;
alter table set_logs enable row level security;
alter table nutrition_targets enable row level security;
alter table foods enable row level security;
alter table nutrition_logs enable row level security;
alter table alcohol_logs enable row level security;
alter table body_measurements enable row level security;
alter table weekly_reviews enable row level security;
alter table audit_events enable row level security;

create policy "profiles owner access" on profiles for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "goals owner access" on goals for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "health context owner access" on health_context for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plans owner access" on training_plans for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "plan weeks owner access" on plan_weeks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "sessions owner access" on scheduled_sessions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "readiness owner access" on readiness_checkins for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "workout logs owner access" on workout_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "exercise logs owner access" on exercise_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "set logs owner access" on set_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "targets owner access" on nutrition_targets for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "foods owner access" on foods for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "nutrition logs owner access" on nutrition_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "alcohol logs owner access" on alcohol_logs for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "measurements owner access" on body_measurements for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "reviews owner access" on weekly_reviews for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "audit owner read" on audit_events for select using (auth.uid() = user_id);
create policy "audit owner insert" on audit_events for insert with check (auth.uid() = user_id);
