-- Training plans, scheduled sessions and workout records.

create table if not exists public.training_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  starts_on date not null,
  ends_on date,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_on is null or ends_on >= starts_on),
  unique (id, user_id)
);

create table if not exists public.plan_weeks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  training_plan_id uuid not null,
  week_number integer not null check (week_number > 0),
  starts_on date not null,
  status text not null default 'planned',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (training_plan_id, week_number),
  unique (id, user_id),
  foreign key (training_plan_id, user_id) references public.training_plans(id, user_id) on delete cascade
);

create table if not exists public.scheduled_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_week_id uuid,
  template_id uuid references public.workout_templates(id) on delete set null,
  scheduled_date date not null,
  session_type text not null,
  status public.session_status not null default 'planned',
  source text not null default 'plan',
  replacement_for_id uuid,
  reschedule_reason text check (char_length(reschedule_reason) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (plan_week_id, user_id) references public.plan_weeks(id, user_id) on delete set null (plan_week_id),
  foreign key (replacement_for_id, user_id) references public.scheduled_sessions(id, user_id) on delete set null (replacement_for_id)
);

create table if not exists public.readiness_checkins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_session_id uuid,
  checkin_type public.checkin_type not null,
  pain_score integer not null check (pain_score between 0 and 10),
  stiffness_change text not null check (stiffness_change in ('better', 'same', 'worse')),
  swelling_level text not null check (swelling_level in ('none', 'mild', 'significant')),
  walking_status text not null check (walking_status in ('normal', 'altered')),
  sudden_change boolean not null,
  confidence_score integer not null check (confidence_score between 1 and 5),
  classification public.readiness_classification not null,
  rule_version text not null,
  trigger_reasons jsonb not null default '[]'::jsonb,
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  foreign key (scheduled_session_id, user_id) references public.scheduled_sessions(id, user_id) on delete set null (scheduled_session_id)
);

create table if not exists public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_session_id uuid,
  started_at timestamptz not null,
  completed_at timestamptz,
  status public.session_status not null default 'in_progress',
  session_effort integer check (session_effort between 1 and 10),
  notes text check (char_length(notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at),
  unique (id, user_id),
  foreign key (scheduled_session_id, user_id) references public.scheduled_sessions(id, user_id) on delete set null (scheduled_session_id)
);

create table if not exists public.exercise_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  workout_log_id uuid not null,
  exercise_id uuid not null references public.exercises(id),
  exercise_order integer not null check (exercise_order > 0),
  created_at timestamptz not null default now(),
  unique (workout_log_id, exercise_order),
  unique (id, user_id),
  foreign key (workout_log_id, user_id) references public.workout_logs(id, user_id) on delete cascade
);

create table if not exists public.set_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_log_id uuid not null,
  set_number integer not null check (set_number > 0),
  weight_kg numeric(6, 2) check (weight_kg is null or weight_kg >= 0),
  repetitions integer check (repetitions is null or repetitions >= 0),
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  effort_score integer check (effort_score between 1 and 10),
  discomfort_score integer check (discomfort_score between 0 and 10),
  completed_at timestamptz not null default now(),
  client_operation_id uuid unique,
  created_at timestamptz not null default now(),
  unique (exercise_log_id, set_number),
  foreign key (exercise_log_id, user_id) references public.exercise_logs(id, user_id) on delete cascade
);
