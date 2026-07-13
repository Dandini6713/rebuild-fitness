-- Roadmap 22: calorie-adjustment configuration (docs/06 §6.7).
--
-- The calorie-adjustment eligibility engine (domain/nutrition/calorieAdjustment.ts) needs
-- two per-user settings that §6.7 calls for but which do not exist yet. Both live on
-- profiles — the config home — following the weekly_alcohol_unit_limit pattern (roadmap 20):
--
--   1. calorie_floor — a CONSERVATIVE safety floor (§6.7: "Never propose a target below a
--      configured safety floor without professional review"; "The private configuration
--      should use a conservative calorie floor"). 1500 kcal is a documented default,
--      adjustable per user. A proposed target below this is never proposed silently: the
--      engine clamps the resulting target to the floor and annotates a professional-review
--      note (it does not breach the floor and it does not apply anything).
--
--   2. adaptive_adjustments_enabled — §6.7: "allow the user to disable adaptive
--      adjustments". Not null, default true (the beta user opts in by default). When false
--      the calorie engine proposes NO change regardless of data — a hard gate the engine
--      honours before it looks at any trend.
--
-- Both are NOT NULL with a default so every existing profile backfills automatically, and
-- neither is a safety rule the client can violate by editing it (they are the user's own
-- configuration), so a plain owner-scoped update under the existing profiles RLS is right —
-- no trusted RPC. weekly_reviews already exists with the right shape and RLS
-- (20260711090300 / 090500) and is NOT touched here; this roadmap only adds the two config
-- columns and reads/writes the existing table.

alter table public.profiles
  add column if not exists calorie_floor integer not null default 1500
    check (calorie_floor > 0);

comment on column public.profiles.calorie_floor is
  'Conservative daily calorie safety floor (docs/06 §6.7). A proposed target below this is never proposed without a professional-review note; the engine clamps to the floor. Default 1500 kcal, adjustable per user.';

alter table public.profiles
  add column if not exists adaptive_adjustments_enabled boolean not null default true;

comment on column public.profiles.adaptive_adjustments_enabled is
  'When false the calorie-adjustment engine proposes no change regardless of data (docs/06 §6.7 "allow the user to disable adaptive adjustments"). Default true.';
