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

Not started:

- Roadmap 09 onwards (weekly planner, and the rest). This is the next piece of work.

Most of the `domain/` tree is still empty placeholders; `domain/training/planSchedule.ts`
is the first real module (pure plan-date and label helpers). The safety-critical rules
engine (Achilles traffic-light logic, strength progression, calorie adjustments) is all
still ahead. When you build it, `docs/06_RULES_ENGINE.md` is the source of truth and every
rule needs tests.

## Why PR numbers and roadmap numbers don't match

A design-system PR was run before the Supabase foundation by mistake, so PR #2 has no
roadmap number and everything after it sits two ahead of its roadmap step. For example,
PR #6 (authentication) is roadmap step 04. Don't count progress by PR number, it will
always overstate where you are. Count against the roadmap.

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

## Next up: Roadmap 09, weekly planner

Build the weekly planner (Plan tab) on top of the seeded schedule and the `features/plan` read
model. Domain calculations stay outside the component, and every view needs loading, empty,
error and offline states.

## Known small issues to clean up (not blocking)

- `SignInScreen.test.tsx` is flaky. It passes alone and usually in full runs, but failed
  once in a full run, which points to test isolation leaking between suites (an unreset
  timer or shared mock) rather than a bug in the screen. Worth pinning down so CI stays
  trustworthy.
- `.DS_Store` is tracked despite being in `.gitignore`. Run `git rm --cached .DS_Store`.
- `npm ci` reports 10 moderate audit findings. Normal for Expo, but worth a glance.
