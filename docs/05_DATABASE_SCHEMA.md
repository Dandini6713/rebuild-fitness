# 5. Database Schema Specification

## 5.1 General conventions

- PostgreSQL UUID primary keys.
- `user_id` on every user-owned record.
- `created_at` and `updated_at` in UTC.
- Soft deletion only where recovery is useful; otherwise support hard deletion through account deletion.
- Numeric health measurements use constrained decimal columns.
- Enumerations use PostgreSQL enums or check constraints where values are stable.
- Free-text notes are optional and length-limited.
- All tables are protected by row-level security.

## 5.2 Core identity and preferences

### `profiles`

One row per authenticated user.

Key fields:

- `user_id uuid primary key`
- `display_name text`
- `date_of_birth date`
- `sex_for_calculation text nullable`
- `height_cm numeric(5,2)`
- `timezone text default 'Europe/London'`
- `preferred_weight_unit text default 'kg'`
- `preferred_distance_unit text default 'km'`
- `onboarding_completed_at timestamptz nullable`

### `goals`

- `id uuid`
- `user_id uuid`
- `goal_type text`
- `start_value numeric nullable`
- `target_value numeric nullable`
- `target_date date nullable`
- `is_active boolean`

### `availability_preferences`

- Preferred training days
- Maximum sessions per week
- Preferred duration
- Preferred training time
- Gym access

Use JSON only for genuinely flexible preference sets. Core searchable values should use normal columns or child tables.

### `equipment`

Master catalogue of gym and home equipment.

### `user_equipment`

Links a user to available equipment and location, such as home or gym.

## 5.3 Safety and readiness

### `health_context`

Stores user-provided contextual restrictions, not diagnoses made by the app.

Fields:

- `id`
- `user_id`
- `context_type`
- `body_area`
- `description`
- `professional_restrictions`
- `active`

### `readiness_checkins`

Fields:

- `id`
- `user_id`
- `scheduled_session_id nullable`
- `checkin_type`, pre-session, post-session or next-morning
- `pain_score`, 0 to 10
- `stiffness_change`, better, same or worse
- `swelling_level`, none, mild or significant
- `walking_status`, normal or altered
- `sudden_change boolean`
- `confidence_score`, 1 to 5
- `classification`, green, amber or red
- `rule_version`
- `trigger_reasons jsonb`
- `notes`

The client must not be able to submit an arbitrary classification without server or shared-domain validation.

## 5.4 Plans and scheduling

### `training_plans`

Represents a named plan and its active date range.

### `plan_weeks`

Represents numbered weeks, their status and progression outcome.

### `workout_templates`

Strength, cardio, recovery or assessment templates.

### `workout_template_exercises`

Ordered exercises, target sets, repetition range, rest and substitution group.

### `scheduled_sessions`

Fields:

- `id`
- `user_id`
- `plan_week_id`
- `template_id`
- `scheduled_date`
- `session_type`
- `status`, planned, in_progress, completed, skipped, replaced or cancelled
- `source`, plan, manual or adjustment
- `replacement_for_id nullable`
- `reschedule_reason nullable`

### `session_adjustments`

Records every proposed and accepted change, including rule evidence.

## 5.5 Exercise catalogue and workout logs

### `exercises`

Fields include:

- Name
- Category
- Movement pattern
- Body region
- Equipment
- Beginner instructions
- Common mistakes
- Stop criteria
- Media reference
- Active flag

### `exercise_substitutions`

Approved directional alternatives. Store the reason and any restrictions.

### `workout_logs`

One row per started session.

### `exercise_logs`

One row per exercise performed, including selected variant and order.

### `set_logs`

Fields:

- `set_number`
- `weight_kg`
- `repetitions`
- `duration_seconds nullable`
- `effort_score`
- `discomfort_score nullable`
- `completed_at`

## 5.6 Cardio

### `cardio_templates`

Defines interval steps and intended progression week.

### `cardio_interval_steps`

Fields:

- `step_order`
- `activity_type`
- `duration_seconds`
- `cue_text`

### `cardio_logs`

Stores duration, distance where available, effort and completion.

## 5.7 Nutrition and alcohol

### `nutrition_targets`

Effective-dated targets for calories and protein. Keep history rather than overwriting.

### `foods`

Personal or provider-sourced food records.

### `meal_templates`

Reusable collections of foods and quantities.

### `nutrition_logs`

Fields:

- `logged_at`
- `meal_type`
- `food_id nullable`
- `description`
- `serving_quantity`
- `calories`
- `protein_g`
- `carbohydrate_g nullable`
- `fat_g nullable`
- `source`, custom, quick, template, barcode or AI-assisted
- `confidence nullable`

### `alcohol_logs`

Fields:

- `logged_at`
- `drink_name`
- `drink_type`
- `volume_ml`
- `abv_percent`
- `calories`
- `units`
- `occasion_note`

Unit calculation: `volume_ml × abv_percent / 1000` when ABV is entered as a normal percentage such as 5.0.

## 5.8 Measurements and reports

### `body_measurements`

Fields:

- `measurement_type`, weight or waist
- `value`
- `unit`
- `measured_at`
- `conditions_note nullable`

### `progress_photos`

Store only a private storage path, capture date, angle and optional note.

### `weekly_reviews`

Contains calculation period, summary metrics, recommendation, explanation, user decision and rule version.

### `audit_events`

Generic audit record for meaningful plan, target, export, deletion and AI-assisted actions.

## 5.9 Row-level security pattern

For each user-owned table:

- Enable row-level security.
- Permit select where `auth.uid() = user_id`.
- Permit insert where `auth.uid() = user_id`.
- Permit update and delete where `auth.uid() = user_id`.
- Master catalogue tables are read-only to authenticated users and writable only through trusted administration.

## 5.10 Indexes

At minimum:

- `(user_id, created_at desc)` for logs.
- `(user_id, scheduled_date)` for sessions.
- `(user_id, measured_at desc)` for measurements.
- `(user_id, logged_at desc)` for nutrition and alcohol.
- `(user_id, status, scheduled_date)` for plan queries.

## 5.11 Data retention and deletion

Private MVP default:

- Retain user data until the user deletes it.
- Hard-delete progress photographs immediately on request.
- Account deletion removes or anonymises all user-owned rows and storage objects.
- Audit records containing personal health data must also be deleted or irreversibly anonymised.
