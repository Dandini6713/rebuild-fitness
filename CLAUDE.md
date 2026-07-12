# CLAUDE.md

Working notes for Claude Code. `AGENTS.md` is the authority for how to build in this
repo (non-negotiables, engineering standards, definition of done). Read it, and read the
files in `docs/` before implementing anything material. This file exists to tell you where
the project currently stands and what to do next, so you don't have to reverse-engineer it
from git history.

## What this is

Rebuild, a private iPhone-first fitness, nutrition and recovery app for a single beta user
to start with, built to sound multi-user data isolation from day one. Stack: React Native,
Expo, TypeScript (strict), Supabase. British English in all user-facing copy.

## Current status (keep this updated)

Progress is tracked against the roadmap in `prompts/01_CODEX_BUILD_PROMPTS.md`, NOT against
PR numbers. See the note below on why those two counts differ.

Complete:

- Roadmap 01, Expo application shell.
- Design system (theme tokens and `components/common`). Built out of sequence, ahead of
  the Supabase work. Harmless, since it's pure UI with no backend dependency.
- Roadmap 02, Supabase client foundation.
- Roadmap 03, database migrations and row-level security.
- Roadmap 04, private beta authentication (password sign-in, secure session persistence,
  protected routes, sign-out).
- Roadmap 05, onboarding domain and forms. Five screens (S-001 to S-005) built with React
  Hook Form and Zod. In-progress answers persist locally in secure device storage so
  onboarding can be left and resumed; on confirmation the finalised profile is written to
  Supabase (`profiles`, `goals`, `health_context`) and `onboarding_completed_at` is set.
  Onboarding runs after sign-in and gates entry to the tabs. See the notes below on the
  deliberate boundaries.
- Roadmap 06, seed the private plan. An authenticated, idempotent Postgres RPC
  (`seed_private_plan`, migration `20260711090600`) writes the two reusable strength
  templates and the twelve-week schedule (12 `plan_weeks`, 84 `scheduled_sessions`) keyed
  to `auth.uid()`, in one transaction, and is called on onboarding confirmation before the
  profile is finalised. The Plan tab now renders the first four weeks. See the notes below
  on what it consumed and the seams it left.
- Roadmap 07, application shell. The five tabs already existed; this step added the three
  remaining shared state components (`LoadingState`, `ErrorState`, `OfflineState` in
  `components/common`, alongside the existing `EmptyState`) and a small offline hook
  (`lib/network/useNetworkStatus.ts`, backed by `expo-network`, degrading to online on web).
  Every tab now shows honest shell states in real British English: Today, Log and Progress
  render empty/offline states describing what will live there (no invented sessions or
  numbers), Plan routes its loading/error/offline paths through the new components, and More
  keeps its working sign-out and diagnostics. See the notes below on the deliberate seams.
- Roadmap 08, Today screen with real data. Today now reads the signed-in user's own rows —
  today's `scheduled_session`, the current `nutrition_targets` row and this week's
  `workout_logs` — and renders the S-010 sections in order: date and greeting, the planned
  session, a dominant "Start session" action, calories and protein, Achilles note where
  relevant, and the weekly adherence summary. All six required states are present (no plan,
  rest day, completed, in progress, offline, query failure). Domain calculations are pure and
  tested (`domain/nutrition/nutritionTargets.ts`, `domain/training/todaySession.ts`, plus
  `currentWeekRange` in `planSchedule.ts`); the read model and view live in `features/today/`.
  See the notes below on what it deliberately left for later.
- Roadmap 09, weekly planner. The Plan tab is now the seven-day planner (S-020): seven day
  cards showing each session, its duration and state, with a session detail sheet offering
  Move, Replace and Skip. The core is a pure, exhaustively tested scheduling-rules module
  (`domain/training/schedulingRules.ts`) implementing exactly docs/06 §6.5 — three hard rules
  (no consecutive runs, a guaranteed rest/recovery day, no two demanding lower-body sessions
  on one day) and the soft warnings (lower-body before a run, the early-phase demanding cap).
  Hard conflicts block the save with a plain explanation; soft conflicts require explicit
  acknowledgement; neither can be bypassed the wrong way. Move/Replace/Skip are owner-scoped
  RLS updates behind repository methods on the extended `features/plan` read model. See the
  notes below on the deliberate seams (readiness, volume, calendar). This superseded the
  roadmap-06 four-week read-only preview on the Plan tab.
- Roadmap 10, exercise catalogue. Typed read access to the shared `exercises` catalogue and
  the S-013 Exercise guide. All twelve Strength A and B exercises now carry complete
  beginner content across the seven guide sections. A new forward migration
  (`20260712090000`) added three nullable columns — `starting_position`, `breathing`,
  `substitution_options` — so each of the seven sections is first-class data the screen can
  render or omit; the content itself is delivered through `seed.sql`, exactly as the original
  four fields already were. The catalogue is shared reference data, not owner-scoped:
  `features/catalogue/` reads it through a narrow backend + read model, with the grouping and
  the seven-section shaping as pure, tested functions in
  `domain/training/exerciseCatalogue.ts`. The guide is reached from a minimal browsable list
  on the More tab. See the notes below on the three reconciliations and deliberate seams.
- Roadmap 11, strength workout player. The guided strength player (S-012) drives a strength
  session's exercises from the seeded template, records each set (weight, reps, effort and
  discomfort) local-first, offers the discomfort action and a rest timer, and links each
  exercise card to its S-013 guide. An on-device SQLite store is the source of truth while a
  session is live; sync to Supabase is idempotent on `client_operation_id`, deduped both
  locally and by the DB unique constraint, so a replay after backgrounding or reconnecting
  never double-writes a set. `features/workouts/` mirrors the other features (narrow backend,
  read model, `useWorkoutPlayer` hook, pure `WorkoutPlayerView`), with the pure set-state and
  timing logic in `domain/training/workoutPlayer.ts` and `workoutTimer.ts`. See the notes
  below on the deliberate seams.
- Roadmap 12, strength progression engine. A pure, versioned engine
  (`domain/training/strengthProgression.ts`, `RULE_VERSION` `strength-progression/v1`)
  implements docs/06 §6.4 exactly: from an exercise's recent completed exposures it returns
  increase / hold / reduce_or_substitute with a recommendation, structured British-English
  reasons, the inputs used and a next action. It never applies anything — it proposes.
  Forward migration `20260713090000` adds `set_logs.technique_controlled`, the
  `weight_increment_kg` / `single_exposure_progression` config on
  `workout_template_exercises`, and an owner-scoped `progression_proposals` table (modelled
  on `readiness_checkins`); `seed_private_plan` seeds the increments and backfills existing
  rows. Completing a strength workout now closes the scheduled session and stores one
  proposal per exercise; the player surfaces the newest proposal with Accept / Not now.
  Exhaustive boundary tests. See the notes below on the deliberate seams.

Not started:

- Roadmap 13 onwards (readiness forms, and the rest). Readiness (docs/06 §6.2) is the next
  piece of work.

Most of the `domain/` tree is still empty placeholders; `domain/training/planSchedule.ts`,
`schedulingRules.ts`, `exerciseCatalogue.ts` and `strengthProgression.ts` are the real
modules so far (pure plan-date/label helpers, the weekly scheduling rules, the catalogue
grouping and guide-section shaping, and the strength progression rules). The rest of the
safety-critical rules engine (Achilles traffic-light logic, running progression, calorie
adjustments) is still ahead. When you build it, `docs/06_RULES_ENGINE.md` is the source of
truth and every rule needs tests.

## Why PR numbers and roadmap numbers don't match

A design-system PR was run before the Supabase foundation by mistake, so PR #2 has no
roadmap number and the PR count ran ahead of the roadmap step for a while (PR #6 was
roadmap step 04, two ahead). That offset is not a fixed constant: it drifts as PRs are
opened, squashed or landed out of order — for instance roadmap 11 (the strength workout
player) landed as PR #12, only one ahead. The rule is simply that PR numbers drift and
tend to overstate where you are, so never count progress by them. Count against the
roadmap.

## Commands

CI runs all four of these on every push and pull request. They must stay green.

```bash
npm run format:check   # prettier
npm run lint           # eslint
npm run typecheck      # tsc --noEmit
npm test -- --runInBand
```

Apply formatting with `npm run format`. Node 22 LTS is expected.

Supabase (local work needs Docker):

```bash
npm run supabase:start
npm run supabase:db:reset          # applies migrations, then loads seed.sql
npm run supabase:migration:new -- descriptive_name
npm run supabase:test:db
npm run supabase:types             # regenerate lib/supabase/database.types.ts
```

Never edit a migration after it has been applied. Add a new forward migration instead.
Commit the regenerated `database.types.ts` diff alongside any migration.

## Conventions worth knowing up front

- Strict TypeScript, plus `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`.
  No `any` unless a third-party boundary forces it, and document why.
- Path alias: `@/*` maps to the repo root (for example `@/lib/supabase`).
- Keep domain logic out of React components. Calculations and rules live as small pure
  functions, ideally under `domain/`, with their own tests.
- Validate all external data with Zod.
- Every feature needs loading, empty, error and offline states.
- No shame-based or appearance-insulting language, and never describe the app as
  diagnosing, treating or rehabilitating injury. See `docs/07`.
- Commit one roadmap prompt at a time, tested, rather than large unreviewable commits.

## Plan-seeding boundaries carried out of Roadmap 06

How seeding works and what it deliberately left for later:

- Mechanism. `public.seed_private_plan(p_start_date date, p_reset boolean)` is a
  `security invoker` RPC: it runs as the signed-in user so `auth.uid()` owns every row and
  RLS is satisfied. It cannot live in `seed.sql`, which has no authenticated user; that
  file still only seeds the shared exercise catalogue. The whole body runs in one
  transaction and the plan is created `pending` and flipped to `active` only after all
  weeks and sessions are written, so a half-seeded plan is never readable as active.
- Idempotency and reset. Re-running with `p_reset = false` when an active plan exists is a
  no-op that returns the existing plan. `p_reset = true` deletes the active plan (its weeks
  cascade; its sessions are deleted explicitly, see below) and the two onboarding templates,
  then rebuilds. Tests in
  `supabase/tests/seed_private_plan.test.sql` assert one plan / 12 weeks / 84 sessions /
  2 templates / 12 template exercises across repeat and reset runs, plus isolation and that
  anon cannot execute it. Note that `scheduled_sessions.plan_week_id` is `on delete set
null`, not cascade, so the reset path deletes the plan's sessions explicitly before
  dropping the plan — deleting the plan alone would orphan them. A development-only helper,
  `npm run supabase:seed:plan -- <auth-user-uuid> [--reset]` (`scripts/dev-seed-plan.sh`),
  invokes the RPC against the local database as that user for re-seeding while building the
  plan screens; it refuses any non-local database.
- Onboarding draft. Roadmap 06 consumes the draft only to set the plan **start date**
  (`resolvePlanStartDate` → the first Monday on/after confirmation, since the persona
  pattern anchors Strength to Monday and Thursday). Mapping sessions onto the user's chosen
  training days is **not** done: done correctly it must honour the weekly safety rules in
  `docs/06 §6.5` (no consecutive demanding sessions, a guaranteed rest day) and overlaps
  activity swapping (Roadmap 15). Equipment/pace are still unconsumed and the
  `availability_preferences` / `equipment` / `user_equipment` tables still don't exist.
- Schema gaps noted, not worked around. `workout_template_exercises` has no duration field,
  so the farmer carry (2 × 30–45 s) is stored with null reps and the dead bug's "per side"
  is a coaching cue only. Cardio Fri/Sat and the Achilles day are typed sessions with no
  descriptive column yet. No strength load or running progression is baked in — that is
  Roadmap 12 and 17; seeding lays down the bare structure they later adjust.
- S-005 loop. The plan now genuinely exists after confirmation. The first four weeks render
  read-only on the **Plan tab** (`features/plan/`, with loading/empty/error/unavailable
  states), not inside S-005 itself, because S-005 redirects to the tabs the moment
  onboarding completes. The richer Today/planner UI is Roadmap 07+.

The onboarding feature lives in `features/onboarding/`; plan seeding and the preview live in
`features/plan/` (repository seam + read model + view) with the pure helpers in
`domain/training/planSchedule.ts`. `react-hook-form` (7.81.0) remains pinned.

## Shell boundaries carried out of Roadmap 07

How the shell works and what it deliberately left for later:

- Shared state components. `LoadingState`, `ErrorState` and `OfflineState` join the existing
  `EmptyState` in `components/common` (exported from its `index.ts`). Each conveys status by
  icon and text, never colour alone (`docs/09 §9.2/§9.8`): they reuse `StatusBadge` for the
  icon+text status rather than re-inventing it. `ErrorState` uses the caution (amber) tone
  and an assertive live region — a failed load is not a safety stop, so it is not red; red
  stays reserved for genuine safety/destructive actions. `OfflineState` uses the info tone
  and a polite live region because being offline is normal and recoverable. `ErrorState`
  composing `EmptyState` was considered and rejected: `EmptyState` carries no status
  semantics and no live-region announcement, so it would have been a lossy near-duplicate.
- Offline detection. `lib/network/useNetworkStatus.ts` wraps `expo-network`'s
  `useNetworkState` (chosen from `docs/04 §4.1`, installed with `expo install` so the SDK
  version matches). The derivation is a pure, exhaustively tested `deriveIsOffline`: it only
  reports offline on a definite negative signal (an undefined field stays online, so no
  offline panel flashes on first render) and always reports online on web, where the signal
  is not meaningful. Richer offline caching (showing already-loaded data while offline) is a
  later concern; today the Plan tab only suppresses the offline panel once a plan is loaded.
- Today is a shell, by design. Roadmap 08 ("Today screen with real data") owns wiring in the
  scheduled session, nutrition targets, recent logs and the dominant "Start session" action.
  This step left Today showing honest empty/offline states with real copy so 08 only has to
  swap in data, not build the states. The seam is flagged in `app/(tabs)/today/index.tsx`.
- Honest copy, no fake data. Today, Log and Progress show empty/offline states describing
  what will live there; the previous demo content (an example "Strength A" card, "3 of 5"
  progress) is gone. More keeps its working sign-out and Supabase diagnostics.

## Today boundaries carried out of Roadmap 08

How Today works and what it deliberately left for later:

- Shape. `features/today/` mirrors `features/plan/`: a narrow `TodayBackend` interface with a
  Supabase adapter (`todayRepository.ts`), a `createTodayRepository` that composes the read
  model from pure domain functions, a `useToday` hook (owner-scoped, keyed by user + date),
  and a pure `TodayView` that renders the resolved state. All calculations are pure and tested
  — `resolveCurrentNutritionTarget` / `computeNutrientProgress`
  (`domain/nutrition/nutritionTargets.ts`), `deriveTodaySessionState` /
  `computeWeeklyAdherence` / `deriveGreeting` / `toIsoDate` (`domain/training/todaySession.ts`)
  and `currentWeekRange` (`domain/training/planSchedule.ts`).
- Empty data is the normal case, and each section degrades on its own. Nothing seeds or writes
  `nutrition_targets` or `workout_logs` yet, and steps/activity has no source at all, so: no
  target shows "no target set" (never a fabricated zero); the steps section is omitted
  entirely; adherence with no training sessions reads as "the week hasn't started" (a null
  percent, not 0 %); and a query error surfaces the error state while empty results do not.
- "Start session" writes for real. The primary action calls a repository method that inserts a
  `workout_logs` row (`started_at`, `status = in_progress`, `scheduled_session_id`, `user_id`)
  — a plain owner-scoped insert under RLS, not one of the docs/04 §4.2 server-authority actions.
  The guided workout player (docs/03 S-012) is a later roadmap item, so on success Today simply
  reflects the now in-progress session and says the player arrives later; it does not build the
  player. Reschedule and recovery swaps are present but disabled, clearly-marked stubs.
- Rest / completed / in-progress are explicit derived states. `session_type = rest` is a calm,
  positive rest-day card (never an empty error); a matching completed `workout_log` (or a
  session already marked completed) drives the completed state; an in-progress log drives the
  continue/acknowledgement state. Skipped/cancelled sessions are not specially handled yet.
- Achilles is a scheduling note, not a status. On Achilles days Today shows an informational,
  icon-and-text note that a readiness check will gate these sessions later; it does not fake a
  green/amber/red classification (docs/06 §6.2 is a later item) and states plainly that it does
  not assess whether the tendon is healed (docs/07).
- "today" is the device's local calendar date (`toIsoDate`), so it matches the day the user is
  living in; plain stored dates are still parsed at UTC midnight for display so they never
  shift. Nutrition intake is wired through `TodayView`/`computeNutrientProgress` but the read
  model supplies `null` intake until food logging exists, so the screen renders targets alone.

## Weekly planner boundaries carried out of Roadmap 09

How the planner works and what it deliberately left for later:

- Rules are the core, and pure. `domain/training/schedulingRules.ts` takes a proposed change
  (move/replace/skip) plus the week's sessions and returns hard and soft conflicts. It
  implements exactly docs/06 §6.5 — no more, no less — and is exhaustively tested, including
  the boundaries (runs exactly one day apart versus two, three demanding sessions versus four).
  The evaluation applies the change to the live sessions first (skipped/cancelled/replaced are
  dropped), then checks each rule. `canSave` blocks hard conflicts; `requiresAcknowledgement`
  gates soft ones. The UI enforcement lives in `useWeeklyPlan`, not the view: a hard conflict
  never reaches the repository, a soft conflict is held pending an explicit "Save anyway", and
  a clean change saves and reloads (a hook test locks all three down).
- Session classification (`classifySession`). Derived from `session_type`: `strength` is a
  demanding lower-body session (both seeded persona templates are compound, lower-body-heavy —
  leg press/RDL, step-ups/glute bridge); `running` is a run and demanding but not lower-body;
  `cardio` is walking/low-impact (never treated as running, which would over-fire the
  consecutive-runs rule); `achilles`/`rest` are recovery. The seam: when a future template adds
  an upper-body-only strength day, `isDemandingLowerBody` needs a template-level flag — the
  classifier already takes the template name so the call sites won't change.
- What the actions persist. All three are plain owner-scoped RLS updates on `scheduled_sessions`
  (like starting a session in roadmap 08, not server-authority RPCs), behind repository methods:
  Move sets `scheduled_date`, Skip sets `status = 'skipped'`, Replace sets `session_type` and
  `template_id`. Each also stamps `source = 'user'` for the adjustment audit trail. Moves are
  restricted to within the displayed week so `plan_week_id` stays valid.
- Read model extended, not reinvented. `features/plan/planRepository.ts` gained a `loadWeek`
  (active plan + sessions in the seven-day range with status, template names and durations) and
  the three mutations, alongside the existing seed/preview. The roadmap-06 four-week read-only
  preview (`PlanPreviewView`/`usePlanPreview`) was superseded by the planner on the Plan tab and
  removed; `loadPreview` itself remains as a still-valid read helper.
- Deliberate seams. (1) The docs/06 §6.5 hard rule "a red readiness result cancels or replaces
  the affected session" depends on the readiness feature (docs/06 §6.2, a later roadmap item);
  `schedulingRules.ts` takes no readiness input and documents the extension point. (2) The soft
  warning "avoid increasing both running stage and lower-body strength volume in the same week"
  needs volume/stage figures that move/replace/skip never change; it lives as a separate tested
  predicate (`evaluateVolumeIncrease`), dormant until progression (roadmap 12/17) feeds it. (3)
  `isEarlyPhase` is a constant `true` for now (running is not yet enabled), so the demanding cap
  always applies; it becomes a per-week derivation once running progression lands. (4) The two
  run-based rules — the hard "no two running sessions on consecutive days" and the soft "avoid
  demanding lower-body the day before a run" — are **dormant against all current data**. This is
  deliberate, not a bug. `classifySession` sets `isRunning` only when `session_type === 'running'`,
  and the seed writes no such type: the week is strength/cardio/achilles/rest, where `cardio` is
  one undifferentiated bucket of walks, bikes and run-walks. Cardio is explicitly **not** a run,
  so the seeded Friday/Saturday cardio pair is correctly not flagged as consecutive runs, and the
  app never flags its own default plan. Both rules activate the moment runs are distinctly typed
  (`session_type = 'running'`), which arrives with run-walk staging in roadmap 17. The rule logic
  is already correct in principle and is proven by run-typed fixture tests in
  `tests/unit/schedulingRules.test.ts`; a companion test asserts the all-cardio seeded week
  produces no hard conflict, guarding against a regression that reclassifies cardio as running.
- S-021 calendar. The monthly overview is a marked seam, noted in `app/(tabs)/plan/index.tsx`:
  detailed scheduling lives in the weekly plan and a month view adds little on the same read
  model, so it was not built thin here. Week navigation (previous/next) is likewise deferred;
  the planner shows the week containing today.

## Exercise catalogue boundaries carried out of Roadmap 10

How the catalogue works and the three things it reconciled rather than guessed:

- Shape. `features/catalogue/` mirrors `features/plan` and `features/today`: a narrow
  `CatalogueBackend` with a Supabase adapter (`exerciseCatalogueRepository.ts`), a
  `createCatalogueRepository` that composes a read model from the pure domain functions, two
  hooks (`useExerciseCatalogue`, `useExerciseGuide`), and pure views
  (`ExerciseCatalogueView`, `ExerciseGuideView`). The grouping and the seven-section shaping
  are pure and tested in `domain/training/exerciseCatalogue.ts`; nothing catalogue-shaped
  lives in a component.
- Not owner-scoped, by design. The `exercises` catalogue is shared reference data, not
  user-owned. The RLS migration exposes it read-only to any signed-in user (`authenticated
catalogue read` — `for select to authenticated using (true)`, plus `grant select on
public.exercises to authenticated`), so the repository reads it with no `user_id` filter.
  The read still waits for an authenticated session because RLS requires one. Grouping into
  Strength A/B is done from the shared table alone, keyed by canonical slug lists that mirror
  `seed_private_plan`, so the catalogue does not depend on a seeded per-user plan existing.
- Reconciliation 1 — seven sections from a five-field table. S-013 wants starting position and
  breathing as their own sections, but the table had no columns for them. Migration
  `20260712090000` adds three nullable text columns (`starting_position`, `breathing`,
  `substitution_options`); the justification is in the migration. Nullable is the point: the
  guide omits a section with no content rather than showing an empty heading
  (`buildGuideSections` returns only populated sections, proven by test). Mapping:
  `beginner_setup`→Equipment setup, `starting_position`→Starting position,
  `execution_steps`→Movement, `breathing`→Breathing, `common_mistakes`→Common mistakes,
  `stop_criteria`→Stop criteria, `substitution_options`→Approved alternatives.
- Reconciliation 2 — approved alternatives. `substitution_group` on
  `workout_template_exercises` is per-template placement and belongs to the activity/equipment
  substitution _flow_ that roadmap 06 deferred (roadmap 15). Rather than pull that forward, the
  guide sources its alternatives from the new `substitution_options` prose column on the
  exercise itself — read-only reference copy, not a swap action. The interactive substitution
  flow (using `substitution_group` and the not-yet-built equipment tables) remains a documented
  seam for a later roadmap.
- Reconciliation 3 — how the guide is reached. There is no workout player yet (that is roadmap
  11, which will link each exercise card to its guide in context), and no catalogue tab. So the
  entry point is deliberately minimal: a browsable list grouped into the two strength sessions,
  reached from a "Learn → Exercise guide" entry on the More tab (`app/(tabs)/more/` became a
  small stack: `exercises.tsx` list, `exercise/[slug].tsx` guide). No search or filtering was
  built; the guide screen is the deliverable, and the richer in-session entry point is roadmap
  11's.
- Safety copy. Stop criteria is presented as plain "when to stop and seek advice" guidance,
  conveyed by icon and text (a caution `StatusBadge`, never colour alone) with an explicit
  non-diagnostic note: the app does not assess or treat injury (docs/07). It never fakes a
  green/amber/red readiness classification — that is a later item (docs/06 §6.2).
- Content delivery. As with the original four fields, the catalogue _content_ lives in
  `seed.sql` (the catalogue's source of truth in this repo), not baked into the schema
  migration. `supabase db reset` applies the migration then loads the full seven-field content
  for all twelve exercises; `database.types.ts` was regenerated for the three new columns.

## Workout player boundaries carried out of Roadmap 11

How the player works and what it deliberately left for later:

- Shape. `features/workouts/` mirrors `features/today` and `features/plan`: a narrow
  `WorkoutPlayerBackend` with a Supabase adapter (`workoutPlayerRepository.ts`), a
  `createWorkoutPlayerRepository` that composes the read model, a `useWorkoutPlayer` hook and a
  pure `WorkoutPlayerView`. The set-state and progress logic (`domain/training/workoutPlayer.ts`)
  and the elapsed/rest clocks (`domain/training/workoutTimer.ts`) are pure and tested; nothing
  player-shaped lives in a component.
- Local-first is the source of truth during a live session (docs/04 §4.4/§4.5). Every completed
  set is written to an on-device store _first_ — SQLite on the phone (`sqliteWorkoutStore.ts`),
  in-memory on web and in tests (`activeWorkoutStore.ts`) — then best-effort synced to Supabase.
  A failed network write never loses the set; it stays queued locally and is replayed on
  reconnect. The player continues the in-progress `workout_logs` row that Today's "Start session"
  created rather than opening a second one.
- Idempotent sync, deduped twice. Each set carries a stable `client_operation_id` (a UUID minted
  once when the set is first recorded, `lib/ids.ts`). A replay after backgrounding or reconnecting
  carries the same id and is dropped both locally (`dedupeByOperationId`) and by the database's
  `set_logs.client_operation_id` unique constraint (a 23505 collision is treated as a benign
  duplicate, not an error), so exactly one row is ever written.
- What a set captures. Per set: weight, reps, a 1–10 effort score and a 0–10 discomfort score.
  `session_effort` on `workout_logs` is currently always written as `null` — there is no
  end-of-session effort prompt yet; the column is present and the seam is flagged for a later step.
- The discomfort action is informational only. "Something feels uncomfortable" surfaces gentle,
  conservative options (reduce the weight, move on, end the session) and records the self-reported
  discomfort score; it never assesses or diagnoses the tendon or any injury (docs/07). The
  equipment-aware exercise substitution flow is deferred to roadmap 15; "Replace exercise" points
  to the guide's approved-alternatives prose in the meantime.
- Deliberate seam that roadmap 12 closes. Completing a workout marks the `workout_logs` row
  `completed` but does **not** update the originating `scheduled_sessions.status`, so the weekly
  planner still shows a finished session as planned. Roadmap 12 (strength progression) fixes this
  in the same `completeWorkout` path and, at the same time, evaluates and stores progression
  proposals.

## Strength progression boundaries carried out of Roadmap 12

How the engine works and what it deliberately left for later:

- The engine is pure and versioned, and it never applies. `evaluateStrengthProgression`
  (`domain/training/strengthProgression.ts`, `RULE_VERSION` `strength-progression/v1`) takes the
  template exercise's config (rep range, target sets, increment, single-exposure flag), the
  exercise's completed exposures most-recent-first, and optional context, and returns the docs/06
  §6.1 decision shape. It proposes; acceptance is a separate, explicit user action. Proposals are
  stored in `progression_proposals` (`proposed` → `accepted`/`dismissed`), never auto-applied.
- An "exposure" is one workout. It is the set of `set_logs` for an exercise within a single
  completed `workout_logs` row. The repository groups them by `workout_log_id`, orders by the
  log's completion time, and hands the engine the most recent one (or two, unless
  `single_exposure_progression`). Increase needs every prescribed set at the top of the rep range
  with controlled technique, effort ≤ 8 and discomfort ≤ 2, met across the required exposures, and
  the proposed weight is exactly the configured increment — never more.
- Technique fail-safe on historical sets. `technique_controlled` is nullable and every set logged
  before roadmap 12 is null. A null technique, effort or discomfort on any set fails the increase
  criteria — a missing value is never read as "good enough to add load". The player captures the
  flag per set and its input **starts null (unset), not controlled**: the lifter must mark
  "Controlled" or "Not controlled" deliberately, and an untouched control persists null so the
  increase rule never fires on assumed-good technique it has no evidence for. A hook test asserts
  an untouched control logs null and that such a set can never earn an increase end to end.
- Time-based exercises are excluded via a null increment, and null-rep exercises are not
  evaluable. The farmer carry (null rep range) returns an honest "not evaluable" hold; the dead
  bug and farmer carry carry a null `weight_increment_kg`, so they can hold or reduce but never
  receive a weight-increase proposal. The seed sets the increments (2.5 kg / 1.0 kg) and leaves
  those two null.
- Readiness, sleep and confidence are optional-context extension points. `amberReadiness`,
  `poorSleep` and `userNotConfident` are optional inputs; when absent they are simply unknown and
  cannot trigger a hold on their own (the same seam shape as `schedulingRules.ts`). Readiness
  (docs/06 §6.2) and any sleep source are later roadmap items; the engine already honours them
  when supplied. "Sharp pain" has no distinct data source, so discomfort ≥ 4 is the documented
  proxy for the reduce/substitute path.
- Volume-increase wiring stays dormant. `evaluateVolumeIncrease` in `schedulingRules.ts` is
  deliberately **not** wired: how an accepted lower-body increase feeds it waits for the running
  side (roadmap 17). The extension point is documented at the foot of `strengthProgression.ts`.
- Surfacing beyond the player is a later step. Proposals are shown in the workout player at the
  next exposure; presenting accepted/held/reduced proposals in the weekly review is roadmap 22.

## Known small issues to clean up (not blocking)

- Test flakes, tracked together:
  - `WorkoutPlayerView.test.tsx` "shows the workout name, exercise number and elapsed time"
    previously asserted "3:05 elapsed" against a bare `elapsedSeconds: 185` literal, which could
    drift under load. **Fixed** in roadmap 12: the fixture now derives elapsed time from a frozen
    start and "now" through the pure `elapsedSeconds` helper the app itself uses, so the assertion
    is deterministic regardless of scheduling.
  - `SignInScreen.test.tsx` is still flaky. It passes alone and usually in full runs, but failed
    once in a full run, which points to test isolation leaking between suites (an unreset timer or
    shared mock) rather than a bug in the screen. Still worth pinning down so CI stays trustworthy.
- `.DS_Store` is tracked despite being in `.gitignore`. Run `git rm --cached .DS_Store`.
- `npm ci` reports 10 moderate audit findings. Normal for Expo, but worth a glance.
