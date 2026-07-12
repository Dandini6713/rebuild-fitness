-- Roadmap 12 follow-up: make storing a progression proposal idempotent.
--
-- completeWorkout evaluates each exercise and inserts one proposal per exercise for
-- the just-completed workout_logs row. A retried completion (a re-tapped "Finish",
-- a replay after backgrounding, a duplicated network call) would otherwise insert a
-- second identical proposal for the same exposure. A unique constraint on
-- (workout_log_id, template_exercise_id) makes the second insert a benign 23505,
-- which insertProgressionProposal now swallows exactly as insertSet does for a
-- replayed set — so exactly one proposal is ever stored per exercise per exposure.
--
-- workout_log_id is nullable (a proposal outlives its triggering log via the
-- composite FK's on delete set null). Postgres treats NULLs as distinct in a unique
-- constraint, so this bounds only rows that carry a log id — which is every row the
-- completion path writes, since it always passes the finishing log's id.
alter table public.progression_proposals
  add constraint progression_proposals_log_template_exercise_key
    unique (workout_log_id, template_exercise_id);
