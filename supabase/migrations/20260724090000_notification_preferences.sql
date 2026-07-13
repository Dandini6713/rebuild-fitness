-- Roadmap 24: per-type local-notification preferences (docs/03 S-051, docs/07 §7.7).
--
-- Prompt 24 requires that EACH notification type is INDEPENDENTLY OPTIONAL — a per-type
-- on/off the user controls, one never affecting another. Following the config-column
-- pattern established by weekly_alcohol_unit_limit (roadmap 20) and calorie_floor /
-- adaptive_adjustments_enabled (roadmap 22), each preference is one owner-scoped boolean
-- column on profiles. profiles already exists with the right owner-scoped RLS
-- (20260711090300 / 090500), so a plain owner-scoped update under that RLS is exactly
-- right — these are the user's own preferences, not a safety rule the client could
-- violate, so no trusted RPC is needed.
--
-- DEFAULTS: every type defaults to FALSE. Notifications are an opt-in convenience the
-- user has not yet been asked about, and the OS notification permission itself must be
-- requested before anything can fire. Starting a private-beta app silently pinging the
-- user (about sessions, weigh-ins or health check-ins) without their consent would be
-- both intrusive and, for the health-adjacent readiness/next-morning reminders, a privacy
-- overreach (docs/07 §7.7 "explain each permission at the point of use"). So OFF is the
-- safe default for every type; the user turns on exactly what they want. NOT NULL with a
-- default so every existing profile backfills automatically.
--
--   notify_sessions       — a reminder that a session is planned today.
--   notify_weigh_in       — a gentle weigh-in reminder on the weigh-in cadence.
--   notify_waist          — a gentle waist-measurement reminder on its cadence.
--   notify_weekly_review  — a reminder that the weekly check-in is ready.
--   notify_readiness      — a reminder to complete a pre-session check before a gated
--                           session (closes the roadmap-13/14 "prompt a pre-session check"
--                           seam).
--   notify_next_morning   — a next-morning check-in reminder the morning after a session
--                           flagged next_morning_check_expected (closes the roadmap-15
--                           "a reminder will be added in a later update" seam).

alter table public.profiles
  add column if not exists notify_sessions boolean not null default false;
comment on column public.profiles.notify_sessions is
  'Local reminder that a session is planned today (docs/03 S-051). Independently optional; defaults off (opt-in).';

alter table public.profiles
  add column if not exists notify_weigh_in boolean not null default false;
comment on column public.profiles.notify_weigh_in is
  'Local weigh-in reminder on the weigh-in cadence (docs/03 S-051). Independently optional; defaults off (opt-in).';

alter table public.profiles
  add column if not exists notify_waist boolean not null default false;
comment on column public.profiles.notify_waist is
  'Local waist-measurement reminder on its cadence (docs/03 S-051). Independently optional; defaults off (opt-in).';

alter table public.profiles
  add column if not exists notify_weekly_review boolean not null default false;
comment on column public.profiles.notify_weekly_review is
  'Local reminder that the weekly check-in is ready (docs/03 S-051). Independently optional; defaults off (opt-in).';

alter table public.profiles
  add column if not exists notify_readiness boolean not null default false;
comment on column public.profiles.notify_readiness is
  'Local reminder to complete a pre-session check before a gated session (docs/03 S-051, docs/06 §6.2). Independently optional; defaults off (opt-in).';

alter table public.profiles
  add column if not exists notify_next_morning boolean not null default false;
comment on column public.profiles.notify_next_morning is
  'Local next-morning check-in reminder after a session flagged next_morning_check_expected (docs/03 S-051, docs/06 §6.2). Independently optional; defaults off (opt-in).';
