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
  Onboarding runs after sign-in and gates entry to the tabs. See the notes below on two
  deliberate boundaries.

Not started:

- Roadmap 06 onwards (seed the private plan, app shell tabs, Today screen, and the rest).
  This is the next piece of work.

The entire `domain/` tree is still empty placeholders. The safety-critical rules engine
(Achilles traffic-light logic, strength progression, calorie adjustments) is all still
ahead. When you build it, `docs/06_RULES_ENGINE.md` is the source of truth and every rule
needs tests.

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

## Onboarding boundaries carried into Roadmap 06

Two things were deliberately scoped during Roadmap 05 and need picking up in 06:

- Availability, equipment and the preferred rate of progress (S-003 and the pace choice)
  are captured and validated, but there is no table for them yet
  (`availability_preferences`, `equipment`, `user_equipment` don't exist). They are kept in
  the local onboarding draft and left for the plan-seeding schema in 06 to consume. Only
  `profiles`, `goals` and `health_context` are written on confirmation.
- S-005 confirmation captures the user's confirmation but does not render the first four
  weeks, because the plan is not seeded until Roadmap 06. The screen shows a clean
  "being prepared" state. Wire the real week rendering when seeding lands.

`react-hook-form` (7.81.0, pinned) is now a dependency. The onboarding feature lives in
`features/onboarding/` (pure domain modules plus screens), the local secure draft store in
`lib/persistence/secureStore.ts`, and shared select controls in `components/forms/`.

## Next up: Roadmap 06, seed the private user plan

Read `supabase/seed.sql` and `docs/06_RULES_ENGINE.md`. Create an idempotent seed process
for the initial twelve-week plan, Strength A, Strength B, Achilles work and cardio stages,
keeping templates separate from scheduled sessions, with a development-only seed/reset
command. Consume the availability and pace captured during onboarding.

## Known small issues to clean up (not blocking)

- `SignInScreen.test.tsx` is flaky. It passes alone and usually in full runs, but failed
  once in a full run, which points to test isolation leaking between suites (an unreset
  timer or shared mock) rather than a bug in the screen. Worth pinning down so CI stays
  trustworthy.
- `.DS_Store` is tracked despite being in `.gitignore`. Run `git rm --cached .DS_Store`.
- `npm ci` reports 10 moderate audit findings. Normal for Expo, but worth a glance.
