-- Roadmap 10: exercise catalogue and the S-013 Exercise guide.
--
-- The guide screen (docs/03 S-013) shows seven sections: equipment setup,
-- starting position, movement, breathing, common mistakes, stop criteria and
-- approved alternatives. The exercises table already carries four of these —
-- beginner_setup (equipment setup), execution_steps (movement), common_mistakes
-- and stop_criteria — plus a single movement_pattern classifier. Three sections
-- had no home, so this migration adds three nullable text columns:
--
--   starting_position    -- how to position the body before the first rep
--   breathing            -- when to breathe in and out during the movement
--   substitution_options -- beginner-friendly "approved alternatives" prose
--
-- Why columns rather than packing structure into the existing fields: each
-- section is distinct coaching content a beginner reads on its own, so a
-- first-class column keeps the data honest and lets the screen render or omit a
-- section by simply checking whether its column is populated. Every column is
-- nullable so the guide degrades gracefully — an absent section shows no heading
-- at all rather than an empty one.
--
-- On "approved alternatives": substitution_group already exists on
-- workout_template_exercises, but it describes per-template placement and belongs
-- to the activity/equipment substitution *flow* that roadmap 06 deferred to a
-- later step (roadmap 15). Rather than pull that forward, the guide sources its
-- alternatives from this lightweight prose column on the exercise itself. It is
-- read-only reference copy, not a swap action; the interactive substitution flow
-- (using substitution_group and the not-yet-built equipment tables) remains a
-- documented seam for a later roadmap.
--
-- Idempotent: "add column if not exists" makes re-running a no-op. As with the
-- original four fields, the catalogue *content* is delivered through
-- supabase/seed.sql (the catalogue's source of truth in this repo), not baked
-- into this schema migration.

alter table public.exercises
  add column if not exists starting_position text,
  add column if not exists breathing text,
  add column if not exists substitution_options text;

comment on column public.exercises.starting_position is
  'S-013 "Starting position" section: how to position the body before the first repetition.';
comment on column public.exercises.breathing is
  'S-013 "Breathing" section: when to breathe in and out during the movement.';
comment on column public.exercises.substitution_options is
  'S-013 "Approved alternatives" section: beginner-friendly reference prose. Not the interactive substitution flow (a later roadmap), which will use workout_template_exercises.substitution_group.';
