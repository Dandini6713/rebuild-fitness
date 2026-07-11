# Codex Build Prompt Sequence

Use one prompt at a time. Before each task, instruct Codex to read `AGENTS.md` and the relevant specification files. Require a summary of changed files, tests run and unresolved risks.

## Prompt 01: Initialise the repository

> Read `AGENTS.md`, `README.md` and `docs/04_TECHNICAL_ARCHITECTURE.md`. Create an Expo React Native application using TypeScript strict mode and Expo Router. Add formatting, linting, unit testing, environment templates and a minimal CI workflow. Do not add product features. Add commands for type checking, linting and tests. Document local setup. Acceptance criteria: the app starts, navigation shell renders, and all quality commands pass.

## Prompt 02: Add Supabase foundation

> Read `docs/05_DATABASE_SCHEMA.md` and `docs/07_SAFETY_PRIVACY_AND_BOUNDARIES.md`. Add the Supabase client, generated database types and environment validation. Create a local-development configuration and migration workflow. Never expose a service-role key. Add a connection health diagnostic. Acceptance criteria: authenticated and unauthenticated client states can be tested safely.

## Prompt 03: Implement schema migration

> Review `supabase/schema.sql`. Convert it into ordered Supabase migrations. Enable row-level security for every user-owned table and add ownership policies. Add SQL tests or documented verification queries proving one user cannot access another user's data. Do not weaken the schema merely to make tests easier.

## Prompt 04: Authentication

> Implement email magic-link or password authentication suitable for a private beta. Add secure session persistence, sign-out and protected routes. Include loading and error states. Acceptance criteria: unauthenticated users cannot reach application tabs, and sign-out removes access to cached private screens.

## Prompt 05: Onboarding domain and forms

> Read `docs/01_PRODUCT_REQUIREMENTS.md` and `docs/03_SCREENS_AND_INFORMATION_ARCHITECTURE.md`. Implement the five onboarding screens with React Hook Form and Zod. Persist progress so onboarding can resume. Use British English. Include the wellness boundary statement. Do not calculate medical fitness.

## Prompt 06: Seed the private user plan

> Read `supabase/seed.sql` and `docs/06_RULES_ENGINE.md`. Create an idempotent seed process for the initial twelve-week plan, Strength A, Strength B, Achilles work and cardio stages. Keep templates separate from scheduled sessions. Add a development-only command to seed or reset the private plan.

## Prompt 07: Build the application shell

> Implement the five-tab navigation: Today, Plan, Log, Progress and More. Add reusable page, card, loading, empty, error and offline components based on `docs/09_DESIGN_SYSTEM.md`. No feature should use placeholder Latin text. Add accessibility labels.

## Prompt 08: Today screen with real data

> Implement Today using scheduled sessions, current nutrition targets and recent logs. The primary action must start today's session. Add states for no plan, completed session, rest day, offline and query failure. Keep domain calculations outside the component.

## Prompt 09: Weekly planner

> Implement the seven-day planner and session detail sheet. Add move, replace and skip actions. Create pure scheduling-rule functions for hard and soft conflicts from `docs/06_RULES_ENGINE.md`. A hard conflict cannot be saved. A soft conflict requires acknowledgement. Add unit tests.

## Prompt 10: Exercise catalogue

> Implement exercise catalogue types, database access and seed records for all exercises in Strength A and B. Include beginner setup, execution, common mistakes, stop criteria and substitution groups. Build the Exercise Guide screen.

## Prompt 11: Strength workout player

> Implement the workout player with one exercise at a time, set logging, previous values, effort, discomfort and rest timer. Persist an active workout locally after every completed set. Synchronise without duplicating sets. Add background and offline tests where practical.

## Prompt 12: Strength progression engine

> Implement pure, versioned strength progression functions exactly from `docs/06_RULES_ENGINE.md`. Return structured reasons and proposed changes. Do not apply progression automatically. Store proposals and acceptance. Add boundary tests for repetitions, effort, discomfort and configured increments.

## Prompt 13: Readiness check forms

> Implement pre-session, post-session and next-morning readiness forms. Validate every required field. Store raw inputs, trigger reasons, classification and rule version. Do not allow an arbitrary client classification to be trusted by the backend.

## Prompt 14: Achilles classifier

> Implement the green, amber and red classifier exactly as specified. Add exhaustive unit tests, including precedence and missing-input cases. Build result screens that use text and icons as well as colour. Red must prevent running and demanding lower-body sessions from starting.

## Prompt 15: Activity substitution flow

> Implement approved substitution of running with flat walking, bike, cross-trainer or rest after an amber result. Preserve the original session and create a linked replacement. Record the reason and schedule a next-morning check where required.

## Prompt 16: Cardio interval player

> Implement walk, bike and run-walk sessions with warm-up, timed intervals, pause, resume, audio cues, haptic cues and cool-down. Persist active state locally. Add the nine configured run-walk stages. Do not add GPS yet.

## Prompt 17: Running progression engine

> Implement versioned running progression, repeat and pause decisions. Require the specified completed sessions and acceptable check-ins. Add tests proving the app cannot progress after red or repeated amber responses or schedule consecutive runs.

## Prompt 18: Measurement logging

> Implement weight and waist forms, history and validation. Build a tested rolling weight-trend function that handles missing days. Display raw values separately from the trend and explain insufficient data.

## Prompt 19: Nutrition targets and manual food logging

> Implement effective-dated calorie and protein targets, personal foods, quick entries, meal templates and daily diary totals. The MVP must work without an external food API. Add recent foods and favourites. Use integer calories and decimal protein grams.

## Prompt 20: Lager and alcohol tracking

> Implement drink logging with volume, ABV, calories and UK units. Add reusable drink favourites and weekly totals. Write unit tests for common pint sizes and strengths. Do not add moralising language or compensatory recommendations.

## Prompt 21: Progress dashboard

> Implement twelve-week and four-week views for weight trend, waist, session adherence, strength, cardio, protein and lager. Handle sparse data honestly. Charts must be accessible and must not use misleading truncated axes.

## Prompt 22: Weekly review calculations

> Implement weekly adherence, strength and running recommendations, and calorie-adjustment eligibility. Every decision must include evidence and rule version. Insufficient logging must result in no calorie change. Add comprehensive tests.

## Prompt 23: Weekly review interface

> Build the review screen with “what happened”, “what improved”, “what needs attention”, safety, proposed changes and confirmation. No proposed target or plan change may apply before explicit confirmation. Record an audit event.

## Prompt 24: Notifications

> Implement local notifications for planned sessions, weight, waist and weekly review. Each notification type is optional. Handle denied permissions gracefully. Do not include sensitive health details in notification text.

## Prompt 25: Export and deletion

> Implement authenticated data export and account deletion. Export to a documented JSON structure. Deletion must remove user-owned rows and private storage objects. Require recent authentication and include clear confirmation. Add integration tests.

## Prompt 26: Accessibility and resilience pass

> Audit the full application against `docs/09_DESIGN_SYSTEM.md` and `docs/10_TEST_PLAN.md`. Fix screen-reader labels, large-text layout, touch targets, focus order, loading, empty, error and offline states. Test an active workout during backgrounding and poor connectivity.

## Prompt 27: Apple Health integration, post-MVP

> Add Apple Health behind a feature flag. Read only explicitly approved categories, beginning with steps and workouts. Explain permissions before requesting them. Add duplicate detection and sync diagnostics. The app must remain fully functional if permission is denied.

## Prompt 28: AI tool layer, post-MVP

> Read `docs/08_AI_COACH_SPECIFICATION.md`. Implement server-side approved tools with strict schemas, minimal data retrieval and audit logging. Do not add free-form database access. Every state-changing tool returns a proposal requiring confirmation.

## Prompt 29: AI conversational interface, post-MVP

> Add the AI coach using structured outputs and the approved tool layer. Enforce the system boundaries. Build the fixed safety evaluation suite before enabling the feature. The feature flag remains off until every evaluation passes.

## Prompt 30: Private beta release review

> Run the complete definition of done, test plan and release gates. Produce a release report listing passing checks, failures, privacy concerns, safety concerns and manual device tests. Do not describe the app as ready if any critical gate remains incomplete.
