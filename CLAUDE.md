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
- Roadmap 13, readiness capture and trusted storage. The Achilles readiness rules (docs/06
  §6.2) are now a pure, versioned classifier (`domain/training/readinessClassification.ts`,
  `RULE_VERSION` `readiness/v1`): from the six S-011 answers it returns red / amber / green
  with red-over-amber-over-green precedence, structured British-English reasons, the inputs
  used and a next action, and an explicit "unclassifiable" result (never green) when a
  required answer is missing or invalid. The write path is trusted: the repo's first
  `security definer` RPC (`submit_readiness_checkin`, migration `20260715090000`) captures
  `auth.uid()`, RE-COMPUTES the classification from the raw answers in SQL (a faithful port
  of the TS rules), and inserts the row with that server-computed classification, rule
  version and trigger reasons. The client passes raw answers ONLY — it can neither set nor
  override the classification, and `readiness_checkins` still has no client INSERT grant.
  `features/readiness/` mirrors the other features (narrow backend calling the RPC, a hook,
  pure S-011/S-015 views, Zod validation); offline answers are held in secure storage and
  replayed on reconnect. All three `checkin_type`s go through the one RPC. A minimal, honest
  result acknowledgement (icon+text, red professional-care copy, a non-diagnosis note) is
  shown; the rich result screens and the red-blocks-session-start enforcement are roadmap 14.
  A pgTAP test asserts the server classifies identically to the documented cases and that no
  classification can be smuggled in. See the notes below on the R13/R14 split and the seams.
- Roadmap 14, readiness result screens and server-enforced blocking. A red pre-session
  readiness result now BLOCKS a running or demanding-lower-body session from starting
  (docs/06 §6.5 hard rule), and the block is server-enforced and unbypassable (docs/07 §7.4).
  The crux is a second `security definer` RPC, `start_scheduled_session` (migration
  `20260716090000`): it captures `auth.uid()`, loads the caller's own scheduled session,
  decides whether it is gated (`session_type in ('running','strength')` — mirroring
  `classifySession`), reads the newest `pre_session` `readiness_checkin` FOR THAT session,
  and raises (creating no row) when that latest classification is red; otherwise it inserts
  the `in_progress` `workout_logs` row and returns its id. The same migration REVOKES INSERT
  on `workout_logs` from `authenticated`, so this RPC is the ONLY way to start a session and
  the block cannot be bypassed by a direct insert (SELECT/UPDATE/DELETE are untouched, so the
  player still completes its own log). BOTH start doors now route through it: `features/today`
  `startSession` and `features/workouts` `createLog`. A blocked start comes back as a typed
  `blocked` failure (marker `readiness-red-block`), never a connection error, and the UI shows
  the honest red result (`ReadinessBlockCard`, shared copy via `readinessCopy.ts`). The S-011
  result screen (`ReadinessResultView`) now conveys the result by icon, heading and text with
  the red professional-care escalation, amber gentler-option guidance and the green
  "does not guarantee safety" caveat. A pgTAP test proves the enforcement matrix (red blocks
  running and strength; green/amber/no-check permit; a later non-red check clears a prior red;
  cardio/achilles are never gated; a blocked start writes no row; a direct client insert is
  denied). See the notes below on the enforcement boundaries and seams.
- Roadmap 15, amber activity substitution. After an amber readiness result the user can swap
  the demanding session for a gentler option (docs/06 §6.2): flat walking, easy cycling, the
  cross-trainer or rest. This is the amber SWAP, distinct from the roadmap-14 red BLOCK — it
  is an action the user opts into, not a safety gate, so it needs no server ENFORCEMENT, only
  an ATOMIC write. The crux is `substitute_session` (migration `20260717090000`), a `security
invoker` transactional RPC (like `seed_private_plan`, NOT a definer like the readiness
  functions — the user owns every row and RLS is the right guard). It performs a LINKED
  replacement, NOT the planner's in-place edit: it marks the original `scheduled_sessions`
  row `replaced` (preserved as the audit trail) and inserts a NEW row for the same date and
  plan week with `replacement_for_id` back to the original, `source = 'user'`,
  `reschedule_reason` recording the amber result and chosen activity, and status `planned` —
  the first real use of `replacement_for_id` and the `replaced` status. Both writes are one
  transaction (all-or-nothing, so no orphaned `replaced` session), the original is locked
  `for update` and must be `planned` (a second substitution fails cleanly), and only gated
  (`running`/`strength`) sessions are substitutable. `features/readiness/` gains the narrow
  backend + `useSessionSubstitution` hook + pure `SubstitutionOptionsView`, wired into the
  amber branch of `ReadinessResultView`; the options are pure/tested in
  `domain/training/activitySubstitution.ts`. Offline fails honestly (the write is
  server-side), never a pretend swap. A pgTAP test proves the atomic replaced+linked
  insert, the double-substitution and invalid-type guards, gating, owner isolation and anon
  denial. See the notes below on the cardio-typing, next-morning and volume-reduction seams.
- Roadmap 16, cardio interval player. The guided cardio player (S-014) plays a seeded run-walk
  stage — warm-up, timed run/walk intervals with a visible current segment and countdown, and
  cool-down — with audio and haptic cues at each transition, and PAUSE/RESUME. The keystone is
  the pure/device SPLIT the brief mandates: the cue DECISION is a pure, exhaustively tested
  scheduler (`domain/training/cardioIntervalPlayer.ts`) that, from the ordered steps and the
  elapsed time, computes the current segment, time remaining, the next transition and typed CUE
  EVENTS (segment-start, halfway, the 3-2-1 countdown, segment-end, session-complete) with their
  timings, plus the pause-aware clock arithmetic; the cue EFFECT is a thin ADAPTER
  (`features/cardio/deviceCardioCueAdapter.ts`, expo-audio + expo-haptics + expo-keep-awake) that
  is the ONLY part jest cannot verify and REQUIRES A SIMULATOR/DEVICE PASS. Three owner-scoped
  tables (`cardio_templates`, `cardio_interval_steps`, `cardio_logs`, migration
  `20260718090000`) hold the programme and the session summary, modelled on the workout tables;
  `seed_cardio_stages()` (called by `seed_private_plan`) seeds the nine §6.3 stages per user.
  `features/cardio/` mirrors `features/workouts/` (narrow repository, `useCardioPlayer` hook,
  pure `CardioPlayerView`); the minimal local resume state lives in a SQLite/in-memory store
  (`lib/persistence/activeCardioStore.ts`), and the `cardio_logs` summary is the synced record on
  completion. Reached from Today's cardio-day "Start cardio session". See the notes below on the
  pure/device split, the resume-state-vs-summary distinction, and the GPS/progression/activity-
  typing seams.
- Roadmap 17, running progression engine. A pure, versioned engine
  (`domain/training/runningProgression.ts`, `RULE_VERSION` `running-progression/v1`) implements
  docs/06 §6.3 exactly: from a stage's completed sessions, their reported efforts and the
  readiness responses across them (pre/post/next-morning classifications and altered walking),
  plus whether the user has confirmed readiness, it returns advance / repeat / regress / pause
  with structured British-English reasons, the inputs used and a next action. Like strength
  progression it PROPOSES and never applies. Precedence is safety-first (regress/pause outranks
  repeat outranks advance); a red or altered-walking response can never yield advance or repeat;
  a single amber holds the stage (repeat), two ambers regress; effort boundary is average ≤ 7 to
  advance and a single 8+ repeats; missing inputs fail the advance test (fail-safe); stage 9 is
  the ceiling (a would-be advance returns a clean "already at the final stage" repeat). Forward
  migration `20260719090000` adds `cardio_templates.required_sessions` (a seeded default of 2)
  and an owner-scoped `running_progression_proposals` table (dedicated, NOT a generalisation of
  the strength `progression_proposals`), keyed on stage numbers and a `plan_week_id`.
  `features/running/` mirrors the other features (narrow backend + read model, `useRunningProgression`
  hook, pure `RunningProgressionView`), reached from a "Running progression" entry on Today; it
  evaluates on demand, stores one proposal and surfaces the newest 'proposed' one with
  Confirm-and-advance / Not-now. The dormant `evaluateVolumeIncrease` (schedulingRules.ts) is now
  LIVE and fed: a running advance plus an accepted lower-body strength increase in the SAME plan
  week surfaces the soft same-week volume warning. Exhaustive unit tests (each condition, the
  precedence, the effort 7-vs-8 and amber once-vs-twice boundaries, the stage-9 ceiling, the
  missing-input fail-safes) and a pgTAP test (owner isolation, no-delete grant, the plan-week FK,
  anon denial). See the notes below on the confirmation model and the stage-application seam.
- Roadmap 18, measurement logging. Weight and waist entry (S-034) with a raw history and a robust
  rolling WEIGHT TREND (docs/06 §6.6). The load-bearing part is a pure, versioned engine
  (`domain/measurements/weightTrend.ts`, `RULE_VERSION` `weight-trend/v1`): from the logged
  measurements and a reference date it returns either a trend (the smoothed level, a direction and a
  signed weekly rate) or an explicit insufficient-data result naming which threshold is unmet. It is
  a seven-day EWMA implemented as a TIME-WEIGHTED mean — each reading's weight is `exp(−ageDays/7)`
  from its ACTUAL elapsed time, not its position in a list — so missing days and same-day clusters
  are handled correctly, unlike a naive per-sample EWMA that mis-weights skipped days. The
  sufficiency gate is both-of: at least three weights in the last seven days AND at least six across
  the last fourteen; below either it never dresses a number up as a trend. Only 'weight' rows feed
  it; 'waist' is history only. `body_measurements` and its RLS ALREADY EXISTED (20260711090300 / 090500) and its columns cover the forms, so NO migration and NO change to `database.types.ts` were
  needed, and none was added. `features/measurements/` mirrors the other logging features (narrow
  repository + `useMeasurementLog`/`useMeasurements` hooks + pure `MeasurementFormView`/
  `MeasurementHistoryView`, Zod validation) writing plain owner-scoped inserts under RLS — no trusted
  RPC, because a measurement has no safety rule to violate. Reached from a rebuilt Log hub (S-030) on
  the Log tab. Exhaustive weight-trend unit tests plus repository/hook/view tests. See the notes below.
- Roadmap 19, nutrition logging. The food half of the Log hub (S-030/S-031/S-032): a food diary,
  personal foods, quick entries, saved meals and effective-dated calorie/protein targets, all
  user-entered (no external food API). ONE new forward migration (`20260720090000`) adds
  `meal_templates` and its child `meal_template_items` (owner-scoped RLS, composite `(id, user_id)`
  FKs, indexes matching the existing tables); `nutrition_targets`, `foods` and `nutrition_logs`
  already existed and were NOT touched. Effective-dated targets keep HISTORY: a new target is a NEW
  row with a later `effective_from`, and "the current target" is resolved (pure
  `resolveCurrentNutritionTarget`) as the latest `effective_from` on or before today. The daily-diary
  totals and the food→log macro scaling are pure, tested functions (`domain/nutrition/nutritionDiary.ts`)
  — integer calories sum exactly, protein rounds to two decimals. `features/nutrition/` mirrors
  `features/measurements` (narrow repository + hooks + pure views, Zod validation, plain owner-scoped
  inserts under RLS — no trusted RPC). The Today intake seam is now CLOSED: `features/today` sums the
  day's `nutrition_logs` and shows real calorie/protein progress. pgTAP for the new tables. See the
  notes below.
- Roadmap 20, alcohol tracking. The alcohol half of the Log hub (S-033): a NEUTRAL drink log, reusable
  drink favourites and a weekly summary (docs/06 §6.9), all user-entered (no external drink database).
  UK units are a pure, tested function (`domain/alcohol/alcoholUnits.ts`): `units = volume_ml ×
abv_percent / 1000` (568 ml at 5% ≈ 2.84), rounded to two decimals; calories are USER-SUPPLIED per
  drink (no invented calories-from-ABV formula). The weekly summary is the pure `summariseAlcoholWeek`,
  which REUSES the roadmap-19 `dayWindow` so weekly totals and alcohol-free days use the same correct
  LOCAL-day boundaries (a drink logged at 00:30 local belongs to the right local day, never a raw UTC
  day). ONE forward migration (`20260721090000`) adds `drink_favourites` (owner-scoped, composite
  `(id, user_id)` key convention, RLS/index/updated_at matching the existing tables) and a NULLABLE
  `profiles.weekly_alcohol_unit_limit` (no invented default); `alcohol_logs` already existed and was
  NOT touched. `features/alcohol/` mirrors `features/nutrition` (narrow repository + hooks + pure views,
  Zod validation, plain owner-scoped inserts under RLS — no trusted RPC, no safety rule to violate).
  TONE is a standing hard constraint: no moralising and NO compensatory logic (see the boundaries below).
  pgTAP for `drink_favourites` and the profiles column; the units function is tested for common pint
  sizes/strengths, the weekly summation and free-day counting for the local-day boundary. See the notes
  below.
- Roadmap 21, progress dashboard. The Progress tab (S-040) is now a read-only DASHBOARD over the seven
  series the earlier roadmaps produce — weight trend, waist, session adherence, strength, cardio,
  protein and alcohol — in a 4-week or 12-week view (docs/09 §9.6). It computes NO new rules and
  proposes nothing; it reuses the existing engines (weightTrend R18, computeWeeklyAdherence's shape,
  stored alcohol units R20) and reads everything else as plain per-week totals. NO migration and NO
  `database.types.ts` change (all series read existing tables), so none was added. No chart library was
  added either: react-native-svg is not installed and a native module cannot be verified by static
  checks/CI, so the charts are HAND-DRAWN from plain Views (bars) and an honest dot scatter (trends).
  The load-bearing part is the PURE, tested scale/axis logic (`domain/progress/chartScale.ts`): bar
  series are always zero-baselined, and the weight/waist trend uses a magnified NON-ZERO baseline that
  is returned as data and always labelled, so a misleading truncated axis can never be produced.
  Windows are weekly buckets on the roadmap-19 LOCAL-day boundary (`progressWindows.ts` reusing
  `dayWindow`); the seven assemblers (`progressSeries.ts`) each handle sparse data honestly (raw points
  plus an explicit "not enough yet", never a fabricated trend). `features/progress/` mirrors the other
  features (narrow repository + `useProgressDashboard` hook + pure views), with a bento grid of unequal
  tiles, one evergreen accent, and light/dark free from the semantic tokens. The weekly review
  (roadmap 22) is a separate screen that will reuse these calculations. See the notes below.
- Roadmap 22, weekly review & calorie adjustment CALCULATIONS (the interface is roadmap 23). The
  load-bearing part is the pure, versioned calorie-adjustment ELIGIBILITY engine
  (`domain/nutrition/calorieAdjustment.ts`, `RULE_VERSION` `calorie-adjustment/v1`) implementing docs/06
  §6.7 exactly. It is FAIL-SAFE FIRST: an ELIGIBILITY GATE runs before any adjustment, and ALL of it
  must hold or the result is `not-eligible` with NO calorie change — ≥14 days since the current target
  began, weight logging meeting the roadmap-18 trend engine's OWN sufficiency (reused, not re-derived),
  nutrition logged on ≥10 of 14 LOCAL days (the roadmap-19 local-day count the fix was protecting), no
  invalidating-event flag, and `adaptive_adjustments_enabled` true. Any missing/unknown input a gate
  needs counts as unmet, so INSUFFICIENT LOGGING ALWAYS MEANS NO CHANGE (the non-negotiable property,
  exhaustively tested in every form). Only if every gate passes are the §6.7 adjustment rules applied
  (loss within 0.2–0.6 kg/wk → no change; loss < 0.1 kg/wk with adherence ≥ 80% or weight increasing →
  propose a bounded reduction; loss > 0.8 kg/wk → propose an increase plus a review-logging note), the
  resulting target CLAMPED to the `calorie_floor` with a professional-review note (never silently
  breached), and NOTHING is applied — it proposes, like the strength/running engines. ONE forward
  migration (`20260722090000`) adds the two §6.7 config values to `profiles`: `calorie_floor` (integer,
  not null, default 1500) and `adaptive_adjustments_enabled` (boolean, not null, default true).
  The §6.8 protein weekly report (`domain/nutrition/proteinReport.ts`, `protein-report/v1`) is a pure
  seven-day average + days-within-10%-of-target, tested at the ±10% boundary. The weekly-review
  ASSEMBLY (`domain/review/weeklyReview.ts`, `weekly-review/v1`) shapes the metrics + recommendations
  the `weekly_reviews` jsonb stores, each recommendation carrying its EVIDENCE and RULE VERSION; it
  SURFACES the strength/running proposals (READ from their tables, not re-run) alongside the calorie
  decision, and reuses `computeWeeklyAdherence` and `summariseAlcoholWeek`. `features/review/` is a thin
  owner-scoped repository (read/write `weekly_reviews` + a latest-review accessor); the review SCREEN
  and accept/dismiss are roadmap 23. pgTAP for the two profiles columns and weekly_reviews owner
  isolation. See the notes below.
- Roadmap 23, weekly review INTERFACE. The Progress tab now has a weekly-review SCREEN (S-041)
  rendering the six sections over the roadmap-22 metrics + recommendations — what happened, what
  improved, what needs attention, safety and recovery, proposed changes and confirmation — and driving
  the CONFIRM-BEFORE-APPLY flow. The load-bearing new pure part is the LOCAL-day nutrition-day count
  (`countNutritionDaysInWindow`, `domain/nutrition/nutritionDiary.ts`) — the roadmap-22 seam this
  roadmap closes: the number of DISTINCT LOCAL days in the 14-day window with at least one
  `nutrition_log`, computed by bucketing each log through the roadmap-19 `dayWindow` (not raw UTC days,
  not log rows). It is what the calorie-eligibility gate's "≥10 of 14 days" reads, so if it were wrong
  the whole gate would be. Accepting a proposal is atomic through ONE `security invoker` RPC
  (`confirm_weekly_review_change`, migration `20260723090000`): applying the change, marking the review
  and writing the audit event happen in a single transaction, and NOTHING is applied until the user's
  explicit confirm. A calorie accept inserts a NEW effective-dated `nutrition_targets` row (calories
  read from the STORED review recommendation, protein carried from the current target, source
  `weekly-review`); a strength/running accept marks the underlying `progression_proposals` /
  `running_progression_proposals` row `accepted` (SURFACED, not re-run — the running stage-application
  loop stays the roadmap-17 seam). Every confirmation records one `audit_events` row carrying the
  decision, rule version and evidence (docs/06 §6.10). `features/review/` gains the generation +
  confirm repository methods, `useWeeklyReview` and `WeeklyReviewView`. pgTAP for the confirm RPC
  (owner isolation, the audit written, atomicity, anon denied). See the notes below.
- Roadmap 24, notifications. Local (never push) notifications with a per-type on/off the user
  controls, following the pure-schedule / device-adapter split of the cardio player. The pure
  `domain/notifications/notificationSchedule.ts` (no React, no I/O, no expo) computes, from the enabled
  types + the relevant data + a reference `now`, the exact set of notifications that SHOULD be
  scheduled — each a typed descriptor with a LOCAL fire time and its NON-SENSITIVE title/body (the copy
  lives in ONE reviewed source, `NOTIFICATION_COPY`, so a privacy test can assert no health value ever
  appears). Six INDEPENDENTLY-optional types (planned sessions, weigh-in, waist, weekly review, the
  pre-session readiness check, and the next-morning check), each an owner-scoped boolean column on
  `profiles` (migration `20260724090000`) defaulting OFF (opt-in). The thin device adapter
  (`features/notifications/notificationAdapter.ts` interface + no-op, `deviceNotificationAdapter.ts`
  expo-notifications, `createNotificationAdapter.ts` selector, lazily loaded) requests permission and
  schedules; DENIED permission is handled gracefully (honest state, no-op scheduling, never a crash or
  a nag). `notificationSync.ts` orchestrates permission → data → pure schedule → adapter idempotently
  (cancel-all-then-apply, so recomputing never duplicates and cancels superseded). `useNotificationSettings`
  - `NotificationSettingsView` (S-051, all §3.3 states) live on the More tab. This CLOSES the
    next-morning reminder seam (roadmap 15) and adds the pre-session readiness reminder. First
    notifications dependency: `expo-notifications@~57.0.3` (SDK-57 compatible via `expo install`). The
    device adapter is the fourth device-verifiable surface (after cardio, dashboard, review) and needs a
    simulator pass. See the notes below.
- Roadmap 25, data export and account deletion. The S-053 screen (More → "Your data") now offers a
  full account EXPORT and a permanent account DELETION (docs/03 S-053, docs/01 FR-082, docs/04 §4.2,
  docs/05 §5.11, docs/07 §7.7/§7.8). EXPORT is CLIENT-ASSEMBLED (RLS already scopes every table to the
  owner): a pure, versioned builder (`domain/account/accountExport.ts`, `ACCOUNT_EXPORT_VERSION`
  `rebuild-account-export/v1`) shapes the fetched rows of ALL 27 user-owned tables into one
  self-describing JSON object, always fully keyed (an empty account is a valid empty export), shared via
  the platform Share API. DELETION goes through a security-DEFINER RPC (`delete_account`, migration
  `20260725090000`) that deletes the caller's `auth.users` row, cascading all 27 owned tables in one
  transaction — the single, complete deletion primitive. A FRESH re-authentication (re-enter password via
  `authService.signInWithPassword`) is required immediately before the destructive confirm, and any
  failure deletes nothing. `features/account/` mirrors the other features (narrow backend + Supabase
  adapter + composed repository, `useAccountExport`/`useAccountDeletion` hooks, pure `AccountDataView`).
  A pgTAP INTEGRATION test seeds a user across all 27 tables, deletes, and asserts every table empty for
  them while a second user is untouched (the cascade-completeness assertion). See the notes below on the
  progress-photos-unbuilt gap, the storage-clear step and the export-rate-limit seam.

Not started:

- Roadmap 26 onwards. The invalidating-
  event flag (illness/travel) still has no capture UI and is a declared seam (an optional engine input
  defaulting to "no event"; the calorie engine and the generation caller already honour it once a
  toggle exists — the natural home is a future settings surface). For running progression, what
  remains is
  APPLYING an accepted stage advance to the forward schedule (a declared seam — see below) and
  choosing which stage a scheduled cardio session plays (still the roadmap 16 seam: the player plays
  the lowest available stage). For readiness, the pre-session check is now PROMPTED by an optional
  reminder (roadmap 24) but is still not a hard gate that forces the check before every gated session;
  from roadmap 15, distinct cardio activity typing on the substitution replacement remains a seam. The
  next-morning reminder is now built (roadmap 24). Apple
  Health / HealthKit measurement import is roadmap 27 — all measurements are manual for now.

Most of the `domain/` tree is still empty placeholders; `domain/training/planSchedule.ts`,
`schedulingRules.ts`, `exerciseCatalogue.ts`, `strengthProgression.ts`,
`readinessClassification.ts`, `activitySubstitution.ts`, `cardioIntervalPlayer.ts`,
`runningProgression.ts`, `domain/measurements/weightTrend.ts`, `domain/nutrition/` (the
effective-dated target resolver `nutritionTargets.ts` and the daily-diary totals + macro scaling
`nutritionDiary.ts`, the calorie-adjustment eligibility engine `calorieAdjustment.ts` and the protein
weekly report `proteinReport.ts`) and `domain/alcohol/alcoholUnits.ts` (UK units + the weekly summary),
plus `domain/progress/` (the pure chart scale/axis logic `chartScale.ts`, the weekly-bucket windowing
`progressWindows.ts` and the seven per-series assemblers `progressSeries.ts`), `domain/review/`
(the weekly-review assembly `weeklyReview.ts`) and `domain/account/accountExport.ts` (the pure,
versioned account-export builder), are the real
modules so far (pure plan-date/label helpers, the weekly scheduling
rules, the catalogue grouping and guide-section shaping, the strength progression rules, the Achilles
readiness classifier, the amber activity-substitution options, the cardio interval scheduler + cue
events + pause arithmetic, the running progression rules, the robust weight trend, the nutrition
target/diary helpers, the calorie-adjustment eligibility engine + protein report, the alcohol units +
weekly totals, the dashboard scale/window/series calculations, and the weekly-review assembly). The
safety-critical calorie-adjustment engine (§6.7) is now built and exhaustively tested;
`docs/06_RULES_ENGINE.md` remains the source of truth and every rule change needs tests.

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

## Readiness boundaries carried out of Roadmap 13

How readiness capture works and what it deliberately left for later:

- The trusted write path is the crux (docs/06 §6.1). `readiness_checkins` is granted only
  `select` and `delete` to `authenticated`, **never `insert`** — deliberately, and unchanged
  here. docs/06 §6.1 requires the classification be produced by the versioned rules and the
  backend never trust a client-chosen one; a direct client insert could write any
  classification (e.g. downgrading a red so a session it should not start becomes startable).
  So the client never inserts a readiness row. It calls the repo's first `security definer`
  function, `submit_readiness_checkin` (migration `20260715090000`), with the RAW ANSWERS
  ONLY. That function captures `auth.uid()` itself, re-computes red/amber/green in SQL (a
  faithful port of `readinessClassification.ts` — same thresholds, same precedence), and
  inserts the row with the server-computed classification, `rule_version` and
  `trigger_reasons`. There is no classification parameter, so a caller cannot supply or
  override one. `security definer` (unlike `seed_private_plan`, which is `security invoker`)
  lets the insert proceed despite the missing grant, while the explicit `auth.uid()` check
  and `user_id = auth.uid()` write keep every row owner-scoped. Hardened like
  `seed_private_plan`: `set search_path = ''`, everything schema-qualified, granted to
  `authenticated` only. A pgTAP test (`supabase/tests/submit_readiness_checkin.test.sql`)
  asserts representative red/amber/green inputs classify identically to the documented
  expectations, that the function exposes no classification parameter, and that anon cannot
  call it.
- The R13 / R14 split. Roadmap 13 owns capturing the forms (S-011 pre-session, S-015
  post-session, and next-morning — all three `checkin_type`s through the one RPC) and storing
  them with a trustworthy classification, plus the pure classifier and a **minimal** honest
  result acknowledgement (label conveyed by icon+text never colour alone, plain explanation,
  allowed action, the red docs/07 §7.2 professional-care copy, and a non-diagnosis note).
  Roadmap 14 owns the rich result screens, the exhaustive precedence/missing-input test
  matrix, and the enforcement that a red result blocks a session from starting. The classifier
  already returns "unclassifiable" (never green) for missing/invalid inputs so R14 can render
  it; the acknowledgement is **not** wired into the Today/planner session-start flow — the
  seam where R14 connects the block is flagged in `ReadinessResultView.tsx` (read the newest
  pre-session classification for the scheduled session at session-start and enforce there).
  Entry to the form is a standalone, non-gating "Readiness check" button on Today
  (`app/(tabs)/today/readiness.tsx`), reachable now but not yet gating anything.
- Storage shape. The six S-011 answers are `not null` on `readiness_checkins`, so all three
  check-in types supply them (the S-015 "Achilles response / general discomfort" IS this
  symptom questionnaire, taken after the session). The migration adds one nullable
  `session_effort` column for the S-015 post-session self-report; reconciling it with the
  still-unused `workout_logs.session_effort` (the roadmap 11 seam) is deferred. The
  unclassifiable case is never stored: `classification` is a `not null` green/amber/red enum,
  so the RPC **rejects** invalid/missing raw answers with an exception rather than persisting a
  default — unclassifiable lives only in the pure classifier (to block form submission and for
  R14's screens).
- Offline. Readiness answers are self-reported health context (docs/07 treats all of it as
  highly private), so a submission that cannot reach Supabase is held in **secure** device
  storage (`lib/persistence/heldReadinessStore.ts`, reusing the onboarding-draft keychain
  store) and replayed on reconnect, following the local-first spirit of the workout player.
  Offline shows a clearly-labelled provisional result from the same pure rules so a red flag is
  never hidden, but the stored/authoritative classification is always the server's. Scope: a
  single held submission (the most recent), not a full multi-item queue — the fuller queue is a
  noted seam.
- The four declared seams (returned/held, not built here): (1) red blocking session start and
  the full result screens are roadmap 14. (2) The amber "replace running with walking / cycling
  / rest, reduce lower-body volume 30–50%" action is the activity substitution flow (roadmap 15) — the classifier returns the recommendation; performing the swap is not built. (3)
  "Previous run produced a material next-morning increase" (an amber trigger) is an optional
  input (`previousNextMorningIncrease`), dormant until there is next-morning history to feed it
  — documented like the `schedulingRules.ts` readiness seam. (4) `amberReadiness` already feeds
  `strengthProgression.ts`; once readiness rows exist a future step passes the latest
  pre-session classification into that engine — **not** wired here. A fifth, smaller seam: "the
  user cannot load the leg normally" (a red trigger, docs/06 §6.2) has no S-011 field, so it is
  honoured as an optional `cannotBearWeight` input for a future form and otherwise dormant.

## Achilles classifier and enforcement boundaries carried out of Roadmap 14

How the red block works and what it deliberately left for later:

- The block is server-enforced, not a UI guard. `start_scheduled_session` (migration
  `20260716090000`, `security definer`, `search_path = ''`, granted to `authenticated` only)
  is the sole writer of a starting `workout_logs` row, because the same migration REVOKES
  INSERT on `workout_logs` from `authenticated`. A client that skipped its own check still
  cannot create the row: with no INSERT grant the direct insert is denied, so the only path in
  re-checks readiness server-side. This is the same principle as roadmap 13's readiness insert
  (the table has no client INSERT grant; a definer RPC is the trusted writer). SELECT / UPDATE
  / DELETE on `workout_logs` are deliberately untouched — the player still reads and, on
  completion, updates its own log; completing a session is not starting one, so it is not gated.
- Both start doors route through the RPC. There are two ways a session begins — Today's
  "Start session" (`features/today` `startSession`) and the player's fallback log creation
  (`features/workouts` `createLog`, used on a deep link / continue when no in-progress log
  exists). BOTH call `start_scheduled_session`; gating only one would leak the block. Today's
  door is the usual one and blocks before navigating to the player.
- Latest-pre-session-check semantics. The RPC reads the single most recent `pre_session`
  `readiness_checkin` for that scheduled session (`order by created_at desc limit 1`). Only the
  latest counts: a later non-red check clears an earlier red (the user rechecked and improved).
  Green and amber both PERMIT the start — amber warns and offers a gentler option (roadmap 15),
  it does not block; only red blocks. No pre-session check at all PERMITS the start: a session
  is never gated behind a check the user was not asked to complete.
- Which session types are gated. Only running and demanding-lower-body (`session_type in
('running','strength')`), mirroring `classifySession` — in the current plan a strength
  session IS demanding lower-body. Cardio, rest and Achilles-day sessions are never blocked by a
  red result. When a future template adds an upper-body-only strength day, this list needs the
  same template-level flag `classifySession` documents; that is the shared seam.
- Typed failure, honest copy. A blocked start returns a typed `blocked` result (detected via
  the `readiness-red-block` marker in the RPC's exception message, `isReadinessBlockError`),
  never a connection error. The UI shows `ReadinessBlockCard` (red status by icon + heading +
  text, the docs/07 §7.2 professional-care escalation, "you can still log and view", a
  non-diagnosis note). The S-011 result screen and the block card share label/tone/heading copy
  via `readinessCopy.ts`, and the sentence copy comes from `presentClassification`, so wording
  has one source.
- The three declared seams (not built here): (1) prompting the user to complete a pre-session
  check before every running/lower-body session is not built — the check stays user-initiated
  (roadmap 13's Today entry), so a gated session with no check simply starts. (2) The amber
  activity swap (replace running with walking/cycling/rest, reduce lower-body volume) is the
  substitution flow (roadmap 15); the result screen returns the guidance, it does not perform
  the swap. (3) Feeding the latest pre-session classification into `strengthProgression.ts`
  (the `amberReadiness` hold) is still a later step — the engine already honours it when
  supplied, but no code passes it in yet.

## Activity substitution boundaries carried out of Roadmap 15

How the amber swap works and what it deliberately left for later:

- The linked-replacement model is the crux, and it is NOT the planner's in-place replace.
  `features/plan` `replaceScheduledSession` MUTATES a session's type in place; that is wrong
  for readiness, where the original must survive. `substitute_session` instead PRESERVES the
  original (marks it `status = 'replaced'`, untouched otherwise — it is the audit trail and
  the record of what was originally planned) and INSERTS A NEW `scheduled_sessions` row for
  the same `scheduled_date` and `plan_week_id`, with `replacement_for_id` pointing back to the
  original, `source = 'user'`, `reschedule_reason` recording the amber result and chosen
  activity, and status `planned`. This is the first real use of `replacement_for_id` and the
  `replaced` status (both added, unused, in `20260711090200`). Migration `20260717090000`.
- Why an INVOKER RPC, not a DEFINER one. The red block (roadmap 14) is a safety gate the
  client must not be able to violate, so `start_scheduled_session` is `security definer` plus
  a revoked INSERT grant — enforcement the client cannot route around. The amber swap is
  different in kind: it is an action the user OPTS INTO, over their OWN rows, so ordinary
  row-level security is exactly the right guard and no privilege escalation is needed. Hence
  `substitute_session` is `security invoker` (like `seed_private_plan`). What it still needs
  is ATOMICITY: two client writes (mark replaced + insert replacement) could half-fail and
  orphan a `replaced` session with no replacement, so both happen in ONE transaction (the
  function body). The original is locked `for update` and must still be `planned`, so a
  second substitution of an already-`replaced` session fails cleanly and creates no second
  row (this also serialises concurrent calls). Only gated (`running`/`strength`) sessions are
  substitutable, mirroring `classifySession` and the start RPC's gating. Hardened like the
  others: `search_path = ''`, schema-qualified, granted to `authenticated` only, anon revoked.
- The cardio-activity-typing seam. The base plan types all low-impact cardio as one `cardio`
  session_type (the roadmap 09 seam — walks, bikes and run-walks are one bucket). So a walk /
  bike / cross-trainer substitution creates a `cardio`-typed replacement with the SPECIFIC
  activity recorded in `reschedule_reason` (via `buildSubstitutionReason` in
  `domain/training/activitySubstitution.ts`), and a rest substitution creates a `rest`-typed
  one. `substitute_session` accepts only `cardio` or `rest` as the new type; it does NOT
  invent walking/bike/cross-trainer types — that is roadmap 16's (the cardio interval player
  and distinct cardio activity typing). When roadmap 16 lands, the replacement's type simply
  becomes specific; the linked-replacement mechanism does not change.
- The next-morning check: LIGHT version done, fuller version deferred. docs/06 §6.2 says
  "schedule a next-morning check". There is no reminder/scheduling engine yet (notifications
  are roadmap 24), so the honest, minimal record is a new nullable
  `scheduled_sessions.next_morning_check_expected` flag (added in the same migration), set on
  the replacement (the hook always passes `expectNextMorningCheck: true` for an amber swap).
  The app can later surface that a next-morning check is expected for that session; building
  the reminder itself is the DECLARED SEAM for roadmap 24.
- What this did NOT do (declared seams): (1) distinct cardio activity types and the cardio
  interval player (roadmap 16). (2) notification reminders for the next-morning check
  (roadmap 24) — only the expectation flag is recorded. (3) the "reduce lower-body volume
  30–50%" half of the amber result — that is a strength-volume adjustment, not an activity
  swap, and belongs with the progression/review work (roadmap 22); it is NOT built here. (4)
  no change to the red block (roadmap 14) — left untouched.
- How Today and the planner reflect a swap. Both read sessions by date range with no status
  filter, so the planner naturally shows the `replaced` original (a "Replaced" badge) beside
  its live replacement. Today's read model now prefers the non-`replaced` session for the day
  and excludes `replaced` originals from weekly adherence (a small, tested change in
  `features/today/todayRepository.ts`), so Today shows the replacement, not the superseded
  original, and a swap does not drag adherence down.

## Cardio interval player boundaries carried out of Roadmap 16

How the cardio player works and what it deliberately left for later:

- The pure-scheduler / device-adapter split is the crux (and the brief's key rule). The cue
  DECISION is a pure module (`domain/training/cardioIntervalPlayer.ts`): `buildTimeline` places
  the ordered steps on an absolute-seconds line; `deriveCardioProgress` gives the current
  segment, its elapsed/remaining and the next transition; `buildCueEvents` emits the typed cue
  events (segment-start, halfway, the 3-2-1 countdown, segment-end, session-complete) with exact
  timings; `cuesBetween` returns the cues in a `(fromExclusive, toInclusive]` tick window so each
  fires exactly once; and the pause-aware clock (`startClock`/`pauseClock`/`resumeClock`/
  `effectiveElapsedSeconds`) excludes paused time so the timeline never advances while paused.
  No React, no I/O, no audio — exhaustively tested, including all nine stage shapes and the
  pause/resume arithmetic. The cue EFFECT is a thin adapter behind a narrow interface
  (`cardioCueAdapter.ts`): a no-op on web/tests, and the real
  `deviceCardioCueAdapter.ts` (expo-audio + expo-haptics + expo-keep-awake) on native, chosen by
  `createCardioCueAdapter.ts` and loaded lazily so nothing native reaches a test/web bundle. The
  hook routes cue events to whichever adapter is injected; tests inject a RECORDING adapter and
  assert cues are ROUTED, never that sound played. A failing pure test means the timer logic is
  wrong; a missed cue in the field means the adapter did not fire.
- The device adapter is the FIRST thing in this repo that genuinely needs a simulator/device
  pass. Static checks (format/lint/typecheck/jest) cannot verify that a beep or a vibration
  actually fires, only that the events are computed and routed. Signing roadmap 16 off fully
  means running a real cardio session on a device and confirming the run-start beep, the walk
  change, the 3-2-1 countdown ticks and the completion chime all fire, ideally with the screen
  locked. The four bundled `assets/audio/*.wav` cue tones and the `expo-audio`/`expo-haptics`/
  `expo-keep-awake` calls are wired but unverifiable here. This is the one declared seam that a
  green CI does not close.
- Three new cardio tables (migration `20260718090000`), all owner-scoped and shaped like the
  workout tables: `cardio_templates` (a name, a nullable `stage_number`, the activity kind, an
  estimate), `cardio_interval_steps` (ordered `warmup`/`run`/`walk`/`cooldown`/… steps with a
  duration and a short `cue_text`, child of a template via the composite `(id, user_id)` FK), and
  `cardio_logs` (one row per started session — started/completed/status/effort/notes, the
  scheduled-session and template links via `on delete set null`, and a nullable duration and
  distance). RLS, indexes, `updated_at` triggers and grants follow `20260711090400/090500`
  exactly. `database.types.ts` was regenerated.
- The nine run-walk stages are OWNER-SCOPED reference data, seeded by `seed_cardio_stages()`
  (`security invoker`, idempotent) which `seed_private_plan` calls — so, like the strength
  templates, they cannot live in `seed.sql` (no authenticated user there). Each stage is a 300s
  warm-up, then (run, walk) repeated, then a 300s cool-down, transcribed EXACTLY from docs/06
  §6.3 (stage 1 = run 60s / walk 120s ×8 … stage 7 = run 720s / walk 120s ×2; stages 8 and 9 are
  continuous runs of 20 and 25 minutes with no walk steps). The doc gives no warm-up/cool-down
  length, so a fixed five minutes each is used, expressed once via the `v_warmup_seconds` /
  `v_cooldown_seconds` constants. Stage 9 is "25 to 30 minutes"; the seed uses the 25-minute
  lower bound. A pgTAP test asserts the stage/step counts and representative durations, plus
  owner isolation, the composite-FK null-on-delete behaviour and anon denial.
- The minimal resume state vs the `cardio_logs` summary. A run-walk session has no per-set rows,
  so the local-first store (`activeCardioStore.ts`, SQLite on device / in-memory on web+tests)
  holds only what is needed to RESUME mid-interval after a background/lock: the session id, the
  clock (started/paused-accum/paused-at) and status. The interval position is DERIVED from the
  clock against the steps, so nothing per-segment is persisted. There is deliberately NO
  heavy per-segment sync — the durable record is for resume, and the ONE synced record is the
  `cardio_logs` summary (duration + effort) written on completion. Offline completion fails
  honestly and keeps the local state for a retry; it never fakes a finish.
- Which stage plays, and the entry point. Starting a cardio session is NOT gated by the
  red-readiness block (only running and demanding lower-body are), so there is no trusted RPC:
  the player owns its own `cardio_logs` row via a plain owner-scoped insert under RLS, resuming
  an in-progress log if one exists. Reached from Today's cardio-day card ("Start cardio session",
  a new optional `onStartCardio` on `TodayView` routing to `app/(tabs)/today/cardio.tsx`), which
  the cardio player screen drives. The one player drives walk, bike and run-walk alike — they
  differ only in their step configuration.
- Declared seams (returned, not built): (1) GPS / distance tracking — `cardio_logs.distance_m`
  exists but is nullable and UNUSED this roadmap (explicitly no GPS yet). (2) The running
  PROGRESSION engine that advances / repeats / regresses stages is roadmap 17; this roadmap only
  PLAYS a stage and seeds the nine, and always plays the lowest available stage because nothing
  chooses a stage yet. (3) Distinct cardio activity-typing at the `scheduled_sessions` level (the
  roadmap 09 / 15 seam) — a substituted or planned cardio day is still typed `cardio`, with no
  link to a specific `cardio_template`; the templates are the natural home for that future
  per-session link, which roadmap 17 will wire. (4) The device audio/haptic adapter needs the
  simulator pass noted above.

## Running progression boundaries carried out of Roadmap 17

How the running progression engine works and what it deliberately left for later:

- The engine is pure, versioned and only proposes (docs/06 §6.3). `evaluateRunningProgression`
  (`domain/training/runningProgression.ts`, `RULE_VERSION` `running-progression/v1`) is the sibling
  of `strengthProgression.ts`: it takes the current stage config (stage number, required sessions),
  the count and reported efforts of completed sessions at that stage, the readiness responses
  across them (pre/post/next-morning classification + altered-walking flag) and the user's
  confirmation, and returns the §6.1 decision shape (advance / repeat / regress / pause with
  reasons, inputs, rule version, next action). It never applies. Precedence is safety-first:
  regress/pause outranks repeat outranks advance; a red response or altered walking after a session
  can never yield advance or repeat; a single amber holds the stage (repeat), two ambers regress;
  the user choosing to pause is a pause unless a safety trigger already forced a regress. Boundaries
  proven by test: advance needs average effort ≤ 7 and a single 8+ repeats; amber once = repeat,
  twice = regress.
- Fail-safe on missing inputs, mirroring the strength engine's null handling. An absent or
  unclassifiable pre-session classification, an unrecorded effort, or a missing confirmation all
  fail the advance test — advancing is only ever proposed on positive evidence. The advance
  criteria require: required sessions completed; every pre-session check present and green (at least
  `requiredSessions` of them); no red post/next-morning; zero ambers; every effort recorded with an
  average ≤ 7; and confirmation. Any gap is a fail-safe repeat.
- The stage-9 ceiling. Stage 9 is the top of the nine-stage programme, so no advance is possible
  from it. When every advance criterion is otherwise met at stage 9 the engine returns a clean
  "already at the final stage" repeat (`already-final-stage`), never an advance to a stage that does
  not exist. A red/altered-walking response still regresses from stage 9.
- A DEDICATED proposal table, NOT a generalisation of the strength one. `running_progression_proposals`
  (migration `20260719090000`) is modelled on `progression_proposals` (owner-scoped RLS with
  select/insert/update but no delete; the proposed → accepted/dismissed + decided_at lifecycle) but
  is keyed on `from_stage_number`, `to_stage_number` and `plan_week_id`. The strength table's FKs
  are exercise-keyed and its RLS/tests are proven, so it was left untouched rather than widened.
- `required_sessions` is a seeded default, expressed once. The migration adds
  `cardio_templates.required_sessions` (not null, default 2, so existing rows backfill automatically)
  and `seed_cardio_stages` writes it from the single `v_required_sessions` constant (all nine stages
  use 2). docs/06 §6.3 does not state a number; 2 is a documented default that is trivial to change
  in one place. The cardio_tables pgTAP test asserts every seeded stage carries it.
- The now-LIVE same-week volume warning (docs/06 §6.5). The dormant `evaluateVolumeIncrease` predicate
  in `schedulingRules.ts` is finally fed, not changed. `evaluateSameWeekVolumeWarning` maps a running
  ADVANCE to `runningStageIncreased = true`; the repository supplies `lowerBodyVolumeIncreased` by
  querying for an ACCEPTED strength `progression_proposals` row (decision `increase`, status `accepted`)
  whose completing workout sits in the SAME `plan_week` and whose exercise is `body_region = 'lower_body'`.
  When both hold, the soft conflict surfaces beside the advance proposal as a note — never a block
  (§6.5 makes it soft, unlike the consecutive-runs hard rule). "Same week" is the same `plan_weeks` row
  (keyed on `plan_week_id`). Tested to fire only when both increases coincide in one week.
- How confirmation is modelled (the design choice). docs/06 §6.3 requires the user's explicit
  confirmation to advance. That confirmation is the ACCEPT action ("Confirm and advance") on the
  proposal: the on-demand evaluation passes `userConfirmedReadiness = true` so an objectively-eligible
  stage yields an ADVANCE proposal to confirm, and nothing moves until the user accepts it — the
  proposed → accepted lifecycle IS the confirmation gate. The engine's confirmation input still exists
  and is tested with both values, protecting the contract for any future non-accepting caller (e.g. a
  preview). `features/running/` evaluates on demand (surfacing an existing pending proposal first, so
  reopening does not churn rows), reached from a "Running progression" button on Today
  (`app/(tabs)/today/running.tsx`), with loading/no-programme/error/offline states.
- The stage-application SEAM (declared, not built). Accepting an advance records the decision
  (`status = 'accepted'`, `decided_at`) but does NOT move the stage the player plays. The base plan
  does not yet link a scheduled cardio session to a stage (the roadmap 16 seam — the player always
  plays the lowest available stage), so applying an accepted advance to the forward schedule is
  heavier than a small change and is deferred. "Current stage" is derived as the staged template of
  the user's most recent completed cardio session (lowest stage when none is completed). When a future
  step wires the per-session stage link, an accepted advance becomes the point that link moves.
- Declared seams left untouched: GPS/distance (still nullable/unused, roadmap seam); the next-morning
  reminder (roadmap 24 — the engine READS next-morning responses but schedules nothing); distinct
  cardio activity typing (roadmap 09/15/16 seam); and no change to the red block (14), the substitution
  flow (15) or the cardio player's device adapter (16).

## Measurement logging boundaries carried out of Roadmap 18

How measurement logging works and what it deliberately left for later:

- No migration, and none was needed. `body_measurements` (`measurement_type` enum 'weight'|'waist',
  `value numeric(7,2) > 0`, `unit`, `measured_at`, `conditions_note <= 500`) and its owner-scoped RLS
  (`for all to authenticated`, `auth.uid() = user_id`) were laid down in 20260711090300 / 090500 and
  cover the two forms exactly. So this roadmap adds no schema, no forward migration and no change to
  `lib/supabase/database.types.ts` — stated explicitly rather than inventing a migration. The pgTAP
  suite is unchanged (nothing DB-side changed); the existing `body_measurements` RLS test still covers
  owner isolation.
- A PLAIN owner-scoped logging feature, no trusted RPC. The client legitimately owns its measurements
  and there is no safety rule it could violate by logging one (unlike readiness's trusted classifier
  or the red session-start block), so a direct owner-scoped INSERT under RLS is exactly right.
  `features/measurements/measurementRepository.ts` does a plain `insert` (the client passes its own
  `user_id`; RLS also checks `auth.uid()`), and offline fails HONESTLY (`status: 'offline'`) — the
  write is server-side, so it is not pretended and nothing is held/replayed (a fuller offline queue is
  a noted seam, not needed for a plain measurement). Zod validation
  (`measurementSchema.ts`) IS the boundary that keeps malformed numbers out: per-type bounds
  (weight 20–500 kg, waist 20–300 cm), at most two decimal places (the numeric(7,2) precision), a
  non-future `measured_at` (back-dating IS allowed), and a <= 500-char note. British English throughout.
- The weight trend is the load-bearing part (docs/06 §6.6), pure and versioned.
  `domain/measurements/weightTrend.ts` (`RULE_VERSION` `weight-trend/v1`) takes the measurements and a
  reference date and returns the §6.1-style shape: a status, the inputs/counts used and the rule
  version. `evaluateWeightTrend` never writes — it computes.
- EWMA-WITH-MISSING-DAYS and how gaps are weighted (the subtle bug this exists to avoid). The trend is
  a seven-day exponentially weighted moving average, but implemented as a TIME-WEIGHTED mean: each
  reading r at age `a` days before the reference date carries weight `w = exp(−a / 7)`, derived from
  its ACTUAL elapsed time, NOT its position in a list. The reported `trendKg` is the weighted mean of
  the readings (the EWMA level at the reference date), and `changePerWeekKg` / `direction` come from a
  time-weighted linear fit of value against time. A naive per-sample EWMA (`s = α·x + (1−α)·s_prev`
  with a fixed α per reading) assumes one reading per equal step, so it silently mis-weights when days
  are skipped and cannot even tell two series apart that share the same readings in the same order but
  different gaps. The tests prove the difference directly: identical naive output but different (and
  correct) time-weighted trends for tight vs wide spacing, and exact same-day aggregation by value.
  The trend is computed from the readings inside the 14-day sufficiency window; readings older than 14
  days do not pull on it.
- The two sufficiency thresholds and the honest insufficient-data state. Both must hold to conclude
  anything: at least THREE weights within the last seven days AND at least SIX across the last
  fourteen (docs/06 §6.6, read as "do not conclude from fewer than three-in-seven OR fewer than
  six-in-fourteen"). Below either, the function returns `status: 'insufficient-data'` with
  `unmetThresholds` naming which gate(s) failed — never a number dressed up as a trend. Boundaries are
  proven at and just below both (3-in-7 and 6-in-14), plus empty, single-measurement, out-of-order and
  future-dated inputs.
- RAW-vs-TREND separation in the UI (docs/06 §6.6). `MeasurementHistoryView` shows the raw logged
  readings and the smoothed trend in SEPARATE cards with different headings, so a trend is never
  mistaken for a measurement. When there is not enough data for a trend, the raw weights STILL show and
  the trend card explains plainly which threshold is unmet ("Log at least three weights within a
  week…") — it never hides the section or shows a misleading value. A view test locks this down.
- WEIGHT-ONLY feeds the trend. `evaluateWeightTrend` accepts a mixed history (so the repository can
  pass rows straight through) but filters to `type === 'weight'` internally; 'waist' rows are history
  only and never affect the trend or the sufficiency counts (both proven by test). The repository
  splits weight and waist into separate lists for the sectioned history.
- The §6.7 calorie-adjustment SEAM (declared, not built). docs/06 §6.7 (roadmap 19/22) will CONSUME
  this trend: the calorie-adjustment rules read the signed `changePerWeekKg` (the deadband on the
  `direction` label is display-only, so §6.7 reads the numeric rate, not the word) against the
  0.2–0.6 kg/week target band, gated by their own data-sufficiency rules. This roadmap PRODUCES and
  DISPLAYS the trend; it does not drive any target change. The weekly review's use of the trend is
  roadmap 22, and Apple Health / HealthKit import is roadmap 27 — all measurements here are manual.
- The Log hub and the entry seams. The Log tab is now a small stack (`app/(tabs)/log/`): the hub
  (S-030) offers Weight and Waist as real logging plus a measurement-history entry, with Food (S-031/
  S-032) and Alcohol (S-033) shown as honest, clearly-disabled placeholders for later roadmaps rather
  than hidden. The date control is a compact relative-day chooser (Today … 6 days ago) covering the
  common back-dating case; a full date/time picker is a later polish. There is no in-hub "recent
  entries" list beyond the history screen, and no charts yet (S-040 progress cards are a later item).

## Nutrition logging boundaries carried out of Roadmap 19

How nutrition logging works and what it deliberately left for later:

- ONE new migration, and only for the genuinely-missing table. `nutrition_targets`, `foods` and
  `nutrition_logs` already existed with the right shape and RLS (20260711090300 / 090500) and were
  NOT recreated or altered. The one missing piece — `meal_templates`, "reusable collections of foods
  and quantities" (docs/05 §5.7) — is added by `20260720090000` as a PARENT (`meal_templates`: a
  name) plus CHILD (`meal_template_items`), exactly like a workout template and its exercises, because
  a meal IS a collection. Each item is modelled on `nutrition_logs`: an optional `food_id` link PLUS
  its own inline `description` and macros, so an item is self-contained and survives the linked food
  being deleted (`on delete set null` on `food_id`) or edited — the snapshot is what the template
  promised. Both tables are owner-scoped with the composite `(id, user_id)` FK convention (a child can
  never point at another user's parent) and RLS/indexes matching the existing tables. `meal_template_items`
  is write-once (edit = delete + reinsert, like `cardio_interval_steps`), so no `updated_at` trigger.
  `database.types.ts` was regenerated; a pgTAP test (`meal_templates.test.sql`) proves owner isolation,
  the cascade on parent delete, the food-link null-on-delete, the composite-FK block and anon denial.
- Effective-dated targets keep HISTORY, they are never overwritten (docs/05 §5.7). Setting a new
  target INSERTS a new `nutrition_targets` row with a later `effective_from`; "the current target" is
  a CALCULATION, the pure `resolveCurrentNutritionTarget` picking the latest `effective_from` on or
  before the reference date (on-or-before — a target effective_from today IS active today; the
  off-by-one edge is the subtle bug here and is tested at the boundary). `unique(user_id, effective_from)`
  makes a same-date collision a clean, named "a target already starts on that date" error, not a crash.
  The protein default begins at ~140 g (`DEFAULT_PROTEIN_TARGET_G`, §6.8); calories have no default —
  the user sets them (the ADAPTIVE calorie proposal is §6.7, roadmap 22).
- Quick entry vs saved food vs saved meal — three log paths, one `nutrition_logs` shape. A QUICK entry
  (source `'quick'`) writes calories/protein directly (`food_id` null — the column is nullable for
  exactly this). A SAVED food (source `'custom'`) is SCALED by a serving quantity via the pure
  `scaleMacros` before writing, so the stored row holds the ACTUAL consumed macros. A SAVED MEAL
  (source `'template'`) is expanded server-side by `logMealTemplate`: it reads the template's items and
  writes one scaled `nutrition_logs` row per item under one meal and time. Recent foods are DERIVED
  from the log (most-recently-logged, de-duplicated by food or by description); favourites are the
  `foods.favourite` flag. All plain owner-scoped inserts under RLS — NO trusted RPC, because nutrition
  has no safety rule to violate (unlike readiness's classifier or the red session-start block). Zod
  validation IS the boundary; offline fails honestly (`status: 'offline'`) and nothing is held.
- Daily totals are pure and exact. `summariseDiary` (`domain/nutrition/nutritionDiary.ts`) groups the
  day's entries by meal (breakfast/lunch/dinner/snacks) and totals them: calories are integers and sum
  EXACTLY (no floating-point drift — the concern the brief flags), protein rounds to two decimals at
  each boundary. The diary shows totals vs the current effective target (remaining calories, protein
  progress); with no target it shows totals alone, never a meaningless "remaining".
- The Today intake seam is CLOSED. `features/today/todayRepository.ts` previously supplied `null`
  intake ("until the food-logging roadmap item lands"). It now sums the day's `nutrition_logs`
  (integer calories exact, protein rounded) and passes real intake into `buildNutrition`, so Today
  shows calorie/protein PROGRESS against the target, not just the target. An empty day is honest
  zero-of-target progress (not null, not fabricated). The Today repository test was updated to assert
  real totals. The day window is the user's LOCAL calendar day, not a raw UTC day. `dayIso` /
  `todayIso` come from `toIsoDate` (the device's LOCAL date), so framing the read as a raw
  `${dayIso}T00:00:00Z..T23:59:59Z` window disagreed with the user's day by their UTC offset: in BST
  (UTC+1) a `nutrition_log` made between local midnight and 01:00 fell into a one-hour gap — after the
  previous UTC day's end and before the current UTC day's start — and appeared in NEITHER day's diary
  or totals (silent data loss that would also have corrupted roadmap 22's per-day intake and its
  ten-of-fourteen day-count). The pure `dayWindow(dayIso, offsetMinutes)`
  (`domain/nutrition/nutritionDiary.ts`, `offsetMinutes` in the `Date.getTimezoneOffset()` convention)
  now returns the UTC instants of local-midnight-to-local-midnight for that date, so adjacent days
  abut exactly with no gap and no overlap. Both nutrition-log day reads use it — the diary
  (`loadDiary(dayIso, offsetMinutes)`) AND the Today intake sum (`load(todayIso, offsetMinutes)`) — and
  the hooks (`useNutritionDiary`, `useToday`) pass `reference.getTimezoneOffset()`. Boundary tests
  cover it directly (`dayWindow`) and end-to-end through both reads: a 00:30-local and an exactly-local-
  midnight log land in the right local day, a 23:30-local log stays out of the next day, and the
  UTC-offset-zero case is unchanged. Same-zone local-day correctness is now handled; a fuller
  multi-timezone/travel story (a user changing zones mid-history) remains a noted seam.
- The §6.7 / §6.8 engine SEAMS (declared, not built). The calorie-adjustment engine (§6.7, roadmap 22)
  will READ the effective target (`resolveCurrentNutritionTarget`) and the day's/period's
  `nutrition_logs`, together with the roadmap-18 weight trend and logging adherence, to PROPOSE target
  changes — it is not built here, and this roadmap drives NO target change. The protein weekly-average
  report (§6.8) and the "disable adaptive adjustments" config also belong with that engine. Alcohol
  logging (S-033, roadmap 20, `alcohol_logs` already exists), external food-API / barcode lookup
  (explicitly out — MVP is manual) and Apple Health (roadmap 27) are untouched.
- The Log hub and screens. The Log tab stack (`app/(tabs)/log/`) now leads with Food and nutrition
  (diary, add food / quick entry, daily targets, saved meals), keeps Measurements, and shows Alcohol as
  an honest disabled placeholder. `features/nutrition/` mirrors `features/measurements`: narrow
  repository + hooks (`useNutritionDiary`, `useNutritionTargets`, `useFoodLibrary`, `useMealTemplates`,
  `useFoodLog`) + pure views (`FoodDiaryView`, `NutritionTargetView`, `FoodEntryView`, `FoodFormView`,
  `MealTemplatesView`). Form inputs use accessibility labels distinct from their visible label text
  (matching `MeasurementFormView`) so a screen reader — and `getByLabelText` — resolves each field
  unambiguously.

## Alcohol tracking boundaries carried out of Roadmap 20

How alcohol tracking works and what it deliberately left for later:

- TONE IS A STANDING HARD CONSTRAINT, not a nicety (docs/07 §7.4, docs/06 §6.9, the roadmap-20 brief).
  This is a NEUTRAL tracker: it RECORDS and TOTALS, it never judges or prescribes. There is deliberately
  no moralising language anywhere (no "too much", no guilt for a drink, no praise for abstaining), no
  colour-coded warning, and — most importantly — NO COMPENSATORY LOGIC OF ANY KIND. The app must never
  suggest fasting, meal-skipping, dehydration or extra/"earned" exercise to offset drinking; docs/06
  §6.9 forbids this explicitly, so it is not a seam to fill later — it must never exist. The
  percentage-of-personal-limit figure is INFORMATION, never a cap, a warning or a target. Any output
  that nudges behaviour is a bug. `WeeklyAlcoholSummaryView.test.tsx` guards this with a broad
  forbidden-vocabulary assertion over the rendered copy in every state, alongside the neutral,
  non-congratulatory empty state.
- The units formula is pure and tested (`domain/alcohol/alcoholUnits.ts`). `computeUnits(volumeMl,
abvPercent) = volumeMl × abvPercent / 1000`, rounded to two decimals (the numeric(6,2) units column) —
  568 ml at 5% ≈ 2.84, per docs/06 §6.9. Units are DERIVED once, at log time, from volume and strength;
  they are never typed by hand and never stored on a favourite (they would only drift). CALORIES are
  USER-SUPPLIED per drink: there is no reliable calories-from-ABV formula worth inventing, so the field
  is entered/estimated (the column already exists on `alcohol_logs`), with an "approximate" label on the
  live estimate (docs/07 §7.4). The unit tests cover the common pint sizes and strengths the brief calls
  out (568 ml at 3.4/4/5/5.2%, 330/440 ml cans, 750 ml wine at 12–14%, 25/50 ml spirit at 40%).
- The weekly summary REUSES the roadmap-19 local-day window. `summariseAlcoholWeek` imports `dayWindow`
  from `domain/nutrition/nutritionDiary` (via `weekDays`/`weekWindow`) so the seven-day totals AND the
  alcohol-free-day count use the same correct LOCAL-day boundaries as the food diary: a drink logged at
  00:30 local belongs to the right local day, and an alcohol-free day is a local day with zero drinks —
  never a raw UTC day (which would mis-assign a drink by the user's UTC offset and corrupt the free-day
  count). Days are bucketed with no gap and no overlap, so each drink lands in exactly one day.
  `offsetMinutes` follows `Date.getTimezoneOffset()`, passed in from the hook, never read from ambient
  state (same convention as the diary). Tested end to end through the repository, including the
  00:30-local edge and the exactly-local-midnight edge.
- The FIVE weekly metrics, and only those (docs/06 §6.9): total drinks, total units, estimated calories,
  alcohol-free days, and percentage of personal limit. The percentage line is shown ONLY when a positive
  `weekly_alcohol_unit_limit` is set; when the limit is null it is omitted entirely (no 0, no fabricated
  limit), and the summary invites the user to set one, describing it as their own figure for information.
- The schema (ONE forward migration, `20260721090000`). `alcohol_logs` already existed with the right
  shape and RLS (20260711090300 / 090500, indexed and updated_at-triggered in 090400) and was NOT
  touched. The migration adds (1) `drink_favourites` — a reusable drink definition (the `foods` parallel
  for alcohol: `drink_name`, `drink_type`, `volume_ml`, `abv_percent`, `calories`), owner-scoped with the
  composite `(id, user_id)` key convention of the workout/cardio/meal tables (ready for a composite FK
  though it currently parents none), RLS/index/updated_at trigger matching the existing tables; and (2)
  `profiles.weekly_alcohol_unit_limit numeric(6,2)`, NULLABLE with NO default. Nullable is the point:
  alcohol has no safe number to invent for someone, so the responsible default is to store nothing until
  the user sets a limit, and the percentage metric is simply not shown until then. `database.types.ts`
  was regenerated. pgTAP (`alcohol_tracking.test.sql`) proves owner isolation, the composite-key
  convention, the RLS with-check block, anon denial, and the nullable-default + owner-write behaviour of
  the profiles column.
- A PLAIN owner-scoped logging feature, no trusted RPC. A drink log is data the user owns with no safety
  rule it could violate (unlike readiness's classifier or the red session-start block), so direct
  owner-scoped INSERTs under RLS are exactly right. `features/alcohol/` mirrors `features/nutrition`:
  narrow repository (`alcoholRepository.ts`) + hooks (`useAlcoholLog`, `useAlcoholSummary`,
  `useDrinkFavourites`, `useAlcoholLimit`) + pure views (`AlcoholLogView`, `DrinkFavouriteFormView`,
  `WeeklyAlcoholSummaryView`, `AlcoholLimitView`), with Zod validation (`alcoholSchema.ts`) as the
  boundary (volume > 0, ABV 0–100, non-negative integer calories, the numeric precisions). Three write
  paths, one `alcohol_logs` shape: a manual drink, a one-tap log from a favourite (units recomputed from
  its volume/ABV), and saving a favourite. Offline fails HONESTLY (`status: 'offline'`) and nothing is
  held/replayed (a fuller queue is a noted seam, not needed for a plain log). The Log hub
  (`app/(tabs)/log/`) now leads Alcohol with a real card into the alcohol stack (`alcohol`,
  `alcohol-week`, `drink-new`, `alcohol-limit`).
- The personal-limit editing surface. The `weekly_alcohol_unit_limit` storage + read is wired
  (`useAlcoholLimit`, read from and written to the caller's own `profiles` row), and a minimal editor
  (`AlcoholLimitView`, reached from the alcohol screens) makes the percentage metric usable now. A fuller
  settings surface for it is a NOTED SEAM — there is no settings screen in the app yet.
- Declared seams (returned, not built): (1) the weekly review's use of alcohol data is roadmap 22 (it
  will READ these logs and the summary). (2) Any calorie-offset / "compensation" logic is FORBIDDEN, not
  a seam — it must never exist. (3) External drink databases / barcode lookup are explicitly out of MVP
  (all drink entry is manual). (4) The next-morning / notification concerns are unrelated (roadmap 24).

## Progress dashboard boundaries carried out of Roadmap 21

How the progress dashboard works and what it deliberately left for later:

- READ-ONLY DISPLAY, no new rules. The Progress tab (docs/03 S-040) shows the seven series the earlier
  roadmaps produce, in a 4-week or 12-week view. It computes NOTHING new and proposes NOTHING — it is a
  presentation layer over existing data. It REUSES the engines rather than re-deriving them: the weight
  trend is the roadmap-18 `evaluateWeightTrend` (with its own 7/14-day sufficiency), adherence follows
  `computeWeeklyAdherence`'s completed-of-planned shape, and alcohol reads the stored per-drink `units`
  (the roadmap-20 `computeUnits` output). Strength, cardio and protein are plain per-week totals. The
  weekly review (roadmap 22) is a SEPARATE screen that will reuse these same calculations.
- NO migration, and none was needed — stated, not invented. Every series reads a table that already
  exists (`body_measurements`, `scheduled_sessions` + `workout_logs`, `cardio_logs`, `nutrition_logs` +
  `nutrition_targets`, `alcohol_logs`). There is no schema change, no new RLS and NO change to
  `lib/supabase/database.types.ts`; the pgTAP suite is untouched. `db reset` + `test:db` still pass
  (135 tests) precisely because nothing DB-side changed.
- The charting DECISION: hand-drawn from plain Views, NO new dependency. react-native-svg is not
  installed, and adding a native module cannot be verified by the static gates or by CI (it also needs
  jest mocking), which would put the green-CI requirement at risk for a screen whose real proof is a
  simulator pass anyway. The dashboard's chart set is small and controlled, so the bars are flex-height
  `View`s and the measurement trends are an honest dot SCATTER (a scatter implies no interpolation, so a
  couple of readings look like a couple of readings — more honest for sparse data than a drawn line). If
  a future need outgrows this (e.g. dense daily lines), react-native-svg via `expo install` is the
  sanctioned next step; it was not pulled in casually here.
- The NO-MISLEADING-AXIS guarantee lives in the pure, exhaustively tested `domain/progress/chartScale.ts`,
  separated from any drawing (docs/09 §9.6). Two scale kinds: `computeBarScale` is ALWAYS zero-baselined
  (a bar is only truthful from zero — counts, minutes, units, percentages), so a truncated bar axis
  cannot be produced at all; `computePointScale` (weight, waist) chooses a magnified NON-ZERO baseline
  because a 0-based axis flattens a real body-weight move, but the baseline is chosen BELOW the lowest
  reading (never clipping a point) and RETURNED as data (`baseline`, `baselineIsZero`) so the view is
  obliged to label it — the magnification is never silent. The `TrendChartView` renders that as an
  "Axis starts at X, not zero" caption. A single reading is CENTRED (fraction ≈ 0.5) in a symmetric band
  so one weigh-in never looks like a trend. The scale tests prove the baseline choice per kind, that
  every fraction lands in [0,1] (baseline ≤ min, top ≥ max), the sparse/single/flat/empty mappings, and
  that two same-shape series at different levels share fractions but carry different labelled baselines.
- Per-series insufficient-data HONESTY, modelled on the weight-trend discipline for ALL series. Weight
  delegates to the engine's own insufficient-data result. Waist needs at least two readings to state a
  change; below that it is `insufficient` and only the raw dots show. The weekly bar series report
  `hasData: false` when the window holds nothing, and each tile then shows an inviting "not enough yet"
  message rather than a blank or a fabricated line. A week with no basis for a value is `null` (a gap),
  distinct from a real zero — adherence with nothing planned is null (not 0 %), an alcohol-free week is a
  real 0 (information, not absence).
- The 4/12-week windows on the LOCAL-day boundary. `domain/progress/progressWindows.ts` splits each view
  into seven-day buckets whose boundaries are the UTC instants of local midnight, REUSING the roadmap-19
  `dayWindow` so the dashboard buckets a reading into exactly the same day the food diary and alcohol
  summary would. `offsetMinutes` (Date.getTimezoneOffset()) is passed in from the hook, never read from
  ambient state. Buckets abut with no gap and no overlap; date-typed rows (`scheduled_date`) bucket by
  day, timestamp-typed rows (`logged_at`/`started_at`/`measured_at`) by instant. Tested end to end,
  including the just-after-local-midnight edge that a raw-UTC boundary would mis-assign.
- Light and dark are FREE via the semantic tokens. Every colour is read through `useAppTheme`; ONE
  evergreen accent carries the emphasis (the featured chart's highlighted bar/point and the callout
  pill), and amber/clay/blue stay reserved for their readiness/caution meaning, never as decorative
  chart colours. No series is conveyed by colour alone: each chart exposes a single accessible text
  summary (the bars/dots are hidden from the screen reader), the raw readings and the smoothed trend are
  presented SEPARATELY (docs/09 §9.6), and the layout is a bento grid of deliberately unequal tiles
  (weight large and featured; adherence a full-width featured bar chart; cardio/protein/strength/lager
  half tiles; waist full-width) so it does not look templated.
- The alcohol tile is STRICTLY NEUTRAL (docs/07 §7.4, docs/06 §6.9): units-per-week totals only, no
  judgement, no limit warning and NO compensatory logic. A view test scans the rendered copy for a
  forbidden vocabulary to guard the tone.
- Declared seams (read as-is, not built): (1) the running stage-application loop (roadmap 17's deferred
  seam) means "strength/cardio" series read whatever the tables hold; the dashboard does not drive it.
  (2) Distinct cardio activity typing (roadmap 09/15/16 seam) is unchanged — cardio minutes come from
  `cardio_logs` regardless of type. (3) This is an interactive/visual screen: like the cardio player, the
  visual result (bento reflow at large Dynamic Type, highlight/callout contrast in both themes) benefits
  from a SIMULATOR PASS that the static gates cannot fully close. (4) The weekly review (roadmap 22) will
  reuse these calculations on its own screen; it is not built here.

## Weekly review & calorie adjustment boundaries carried out of Roadmap 22

How the weekly-review calculations work and what they deliberately left for later:

- The ELIGIBILITY GATE is the whole point, and it fails safe (docs/06 §6.7, docs/10 §10.2 "Insufficient
  logs prevent calorie changes"). `evaluateCalorieAdjustment` (`domain/nutrition/calorieAdjustment.ts`,
  `RULE_VERSION` `calorie-adjustment/v1`) runs the §6.7 "Data sufficiency" gate BEFORE it looks at any
  weight rate. ALL of these must hold or the result is `not-eligible` with `deltaKcal: null` and NO
  proposed target: (1) `daysSinceTargetBegan >= 14`; (2) the weight trend is a `'trend'`, reusing the
  roadmap-18 engine's OWN 3-in-7 AND 6-in-14 sufficiency (NOT a re-derived threshold) — an
  `insufficient-data` trend fails the gate; (3) `nutritionLoggedDayCount >= 10` over 14 days; (4) no
  invalidating-event flag; (5) `adaptiveAdjustmentsEnabled` is true. A missing target, a null
  `daysSinceTargetBegan`, or any unknown a gate needs counts as UNMET — a wrongly-eligible reduction on
  absent data is the worst failure this module can produce, so absent data is never read as "safe to
  cut". A not-eligible result reports EVERY unmet gate (for an honest explanation), not just the first.
  The engine is exhaustively tested: each gate failing individually, the day-13-vs-14 / 9-vs-10 / adherence
  79-vs-80 boundaries, and insufficient logging in EACH form yielding no change even when the weight
  pattern would otherwise cut calories.
- Only after the gate passes are the §6.7 adjustment rules applied EXACTLY, with the loss expressed as a
  signed rate (`loss = -changePerWeekKg`): loss within 0.2–0.6 kg/wk → `no-change`; loss < 0.1 kg/wk with
  adherence ≥ 80% (or weight increasing with adherence ≥ 80%) → `propose-reduction`; loss > 0.8 kg/wk →
  `propose-increase` paired with a review-logging note. Adherence below 80% with low loss is NOT eligible
  for a reduction (the rule requires ≥ 80%), and a NULL adherence can never justify a reduction (fail-safe)
  — both leave the target unchanged. Boundaries are inclusive/exclusive exactly as documented and tested
  (loss = 0.1, 0.2, 0.6, 0.8 all resolve to no-change; the gaps 0.1–0.2 and 0.6–0.8 trigger no rule → no
  change). The adjustment magnitude is a single conservative `ADJUSTMENT_STEP_KCAL = 100`, always within
  the 100–150 kcal band and the one point to change if the band is revisited.
- The CALORIE FLOOR is never silently breached (docs/06 §6.7). A reduction whose stepped target would
  fall below `profiles.calorie_floor` is CLAMPED UP to the floor, the delta reduced to match, and a
  `professionalReviewRequired` flag + `floor-reached` reason attached; a target already at the floor
  yields a delta of 0 and the same flag ("seek professional advice before going lower"). It clamps and
  annotates — it does not breach, and it never applies.
- The two new profiles config values (ONE forward migration `20260722090000`): `calorie_floor integer
not null default 1500` (a conservative documented default, §6.7, adjustable, `> 0` constrained) and
  `adaptive_adjustments_enabled boolean not null default true` (§6.7 "allow the user to disable adaptive
  adjustments" — false is a HARD gate: no change regardless of data). Both NOT NULL with defaults so
  existing profiles backfill; `weekly_reviews` already existed with the right shape/RLS and was NOT
  touched. `database.types.ts` was regenerated. pgTAP (`calorie_adjustment_config.test.sql`) proves the
  defaults, the positive-floor constraint, owner-writability, and weekly_reviews owner isolation.
- The §6.8 PROTEIN report (`domain/nutrition/proteinReport.ts`, `protein-report/v1`) is a pure seven-day
  average + count of days within ±10% of target, reusing the diary's daily totals and the effective
  target. It REPORTS; it proposes no protein change (protein has no adaptive rule). Tested at the ±10%
  boundary (target 140 → within-band [126, 154] inclusive).
- The weekly-review ASSEMBLY (`domain/review/weeklyReview.ts`, `weekly-review/v1`) SHAPES the metrics +
  recommendations the `weekly_reviews` jsonb stores; it computes no new rules. Metrics snapshot each
  engine honestly (a null where there is no basis — adherence with nothing planned, an insufficient weight
  trend — never a fabricated zero), reusing `computeWeeklyAdherence` and `summariseAlcoholWeek`. EVERY
  recommendation carries its EVIDENCE (the engine inputs) and its own RULE VERSION (docs/06 §6.1/§6.10).
  The strength and running recommendations are SURFACED — READ from `progression_proposals` /
  `running_progression_proposals` (the roadmap-12/17 engines produced them), NOT re-run here — with their
  stored status and version travelling through. The calorie recommendation is always present (informative
  even at no-change) and marked `actionable`/`proposed` only when it proposes a change.
- ACCEPTED-CHANGE APPLICATION IS DEFERRED to roadmap 23 (a declared seam). A calorie proposal is
  accept-not-auto, exactly like the strength/running proposals, so acceptance is MODELLED in the data
  shape — a per-recommendation status and the `weekly_reviews.accepted_changes` jsonb slot — but this
  roadmap does NOT apply anything. Applying an accepted calorie change (inserting a new effective-dated
  `nutrition_targets` row) is wireable minimally since the table + `resolveCurrentNutritionTarget` already
  exist, but it belongs with the accept/dismiss INTERFACE (roadmap 23) and is user-accept-first, never
  automatic.
- `features/review/` is a THIN owner-scoped repository over `weekly_reviews` (narrow backend + Supabase
  adapter + composed repo, mirroring `features/alcohol`): `saveReview` (an idempotent upsert on
  `(user_id, period_start, period_end)`), `loadReview(period)` and `loadLatestReview` (the minimal
  accessor). Offline fails honestly; no trusted RPC (the safety-critical decision is made by the pure
  engine before it reaches the repository, so nothing the client sends can smuggle in an ineligible
  change). The review SCREEN, the accept/dismiss actions and the full data-gathering orchestration are
  roadmap 23 — the repository read/write and the pure assembly are what this roadmap ships and tests.
- Declared seams left untouched: the invalidating-event flag (illness/travel) has no capture UI — an
  optional engine input defaulting to "no event", honoured once a later step captures it; notifications
  (roadmap 24) and export (roadmap 25) are unrelated. No change to any earlier engine — the calorie engine
  CONSUMES the roadmap-18 trend and roadmap-19 target/logs and the review SURFACES the roadmap-12/17
  proposals, but re-runs none of them.

## Weekly review interface boundaries carried out of Roadmap 23

How the weekly-review screen and the confirm flow work, and what they deliberately left for later:

- The LOCAL-day nutrition count is now COMPUTED here — the roadmap-22 seam is closed. The calorie
  engine consumes `nutritionLoggedDayCount` (≥10 of 14 days), and roadmap 22 deliberately left the
  COUNT to the caller. `countNutritionDaysInWindow` (`domain/nutrition/nutritionDiary.ts`) is that
  count: the number of DISTINCT LOCAL days in the 14-day window on which at least one `nutrition_log`
  exists, bucketing each log through the roadmap-19 `dayWindow` (REUSED, not re-derived). It is a
  LOCAL-day count, NOT raw UTC days and NOT log ROWS — three logs on one local day count once, and a
  log at 00:30 local counts for its local day (the exact property the roadmap-19 fix protects). Pure
  and boundary-tested (00:30-local, multiple-logs-one-day, the 9-vs-10 flip). If this were wrong the
  whole §6.7 eligibility gate would be wrong, so it is the load-bearing part of this roadmap.
- CONFIRM BEFORE APPLY is the hard rule (docs/10 §10.2 "No change applies without confirmation").
  Tapping Accept or Dismiss only STAGES a decision in the hook (`useWeeklyReview` `pending`); nothing
  is applied until the user taps the final Confirm (`confirmPending`). The view renders the
  Confirmation section (S-041 §6) only when a decision is staged; a hook test and a view test both
  lock down that Accept/Dismiss call nothing until confirm.
- The confirm path is ONE atomic `security invoker` RPC (`confirm_weekly_review_change`, migration
  `20260723090000`), because a confirmation spans up to three tables and must not half-succeed:
  applying the change, marking the review (recommendation status in the `recommendations` jsonb +
  appending to `accepted_changes` + stamping `reviewed_at`) and writing the audit event all happen in
  one transaction. It is `security invoker` like `substitute_session`, NOT a definer — the user owns
  every row, so RLS is the right guard and no privilege escalation is needed. The safety-critical
  decision was already made by the pure calorie engine when the review was assembled, and the applied
  calorie target is READ FROM THE STORED REVIEW (`recommendations -> change -> proposedTargetCalories`),
  not from a client parameter, so the client cannot smuggle in a different number and the audit trail
  is faithful. Hardened like the other functions (`search_path = ''`, schema-qualified, granted to
  `authenticated` only, anon revoked). The row is locked `for update` so concurrent confirms serialise.
- An accepted CALORIE change becomes a NEW effective-dated `nutrition_targets` row (the roadmap-19
  insert-not-overwrite path): the RPC inserts a row with the stored proposed calories, the protein
  carried from the current effective target (resolved in SQL, defaulting to the §6.8 140 g when the
  user has none), `effective_from` the device-local today the client passes, and `source =
'weekly-review'`. The old targets are kept as history; `resolveCurrentNutritionTarget` picks the new
  one up from today. A floor-clamped reduction (`professionalReviewRequired`) surfaces the docs/07
  professional-review escalation in BOTH the Safety section and the confirmation panel before it can
  be accepted.
- An accepted STRENGTH or RUNNING recommendation marks the corresponding `progression_proposals` /
  `running_progression_proposals` row `accepted` (the existing accept path) — SURFACED and confirmed,
  NOT re-run. The recommendation carries the underlying `proposalId` (threaded through the assembler's
  `SurfacedProposal`) so the RPC targets the right row. Applying a running stage advance to the forward
  schedule remains the roadmap-17 seam (acceptance only records the decision). A dismissal marks the
  review item — and, for strength/running, the underlying proposal — `dismissed`; it ALSO writes an
  audit event, so the trail is complete (a declined safety-relevant proposal is a recorded decision,
  not silence).
- One audit event per confirmation (accept OR dismiss), queryable by `event_type`
  (`weekly_review_change_accepted` / `_dismissed`) and `entity_type`/`entity_id`, its `details` jsonb
  carrying the decision, rule version and evidence (docs/06 §6.10). `audit_events` already existed with
  its RLS + insert grant, so NO schema change there.
- Generation wires real data into the pure roadmap-22 engines. `generateReview`
  (`features/review/weeklyReviewRepository.ts`) gathers the week's rows — config (`calorie_floor`,
  `adaptive_adjustments_enabled`, `weekly_alcohol_unit_limit`), targets, weight measurements, sessions
  - workout logs, the 14-day nutrition logs, drinks, and the proposed strength/running proposals — and
    feeds `evaluateWeightTrend`, `computeWeeklyAdherence`, `countNutritionDaysInWindow`,
    `summariseProteinWeek`, `summariseAlcoholWeek`, `evaluateCalorieAdjustment` and
    `assembleWeeklyReview`, then upserts. The heavy lifting stays in the pure modules; every window uses
    the LOCAL-day `dayWindow` boundary. The screen loads the latest stored review or offers to prepare
    the current week's.
- Only ONE migration + ONE RPC were added; the `WeeklyReviewRecommendation`/`SurfacedProposal` domain
  shapes gained optional `change` (the concrete calorie target) and `proposalId` fields so the stored
  review is self-contained for the confirm path. `database.types.ts` was regenerated for the new RPC.
- This is a VISUAL screen: like the dashboard and the cardio player, the bento/section layout, the
  confirmation panel contrast and light/dark both benefit from a SIMULATOR PASS the static gates
  cannot fully close (unresolved debt).
- Declared seams left untouched: notifications/reminders to prompt the review (roadmap 24); the
  running stage-application loop (roadmap 17); the invalidating-event CAPTURE UI (the engine input
  still defaults to "no event" — the toggle's natural home is a future settings surface). READINESS is
  not part of the roadmap-22 review model, so "what needs attention"/"safety" surface the calorie
  floor-clamp professional-review escalation and adherence/logging notes rather than a red readiness
  item; wiring readiness history into the review is a future step.

## Notifications boundaries carried out of Roadmap 24

How local notifications work and what they deliberately left for later:

- The pure-schedule / device-adapter split is the crux, mirroring the roadmap-16 cardio player exactly.
  The SCHEDULING DECISION is a pure module (`domain/notifications/notificationSchedule.ts`): no React, no
  I/O, no expo import. `computeNotificationSchedule` takes the enabled types, the relevant data
  (upcoming planned sessions, a session flagged `next_morning_check_expected`, the last weigh-in/waist
  local days) and a reference `now`, and returns the exact set of notifications that SHOULD be scheduled
  — each a typed `ScheduledNotification` with a LOCAL fire time (`LocalDateTime` components, never a raw
  UTC instant) and its non-sensitive title/body. It is exhaustively unit-tested (fire times on the local
  day, each type independently on/off, the past-fire-time skip, the next-morning-after-flagged-session,
  the weekly-review weekday, the weigh-in cadence, key uniqueness). The device EFFECT is a thin adapter
  behind a narrow interface (`features/notifications/notificationAdapter.ts`: interface + a no-op default
  for tests/web) with the real `deviceNotificationAdapter.ts` (expo-notifications: request permission,
  schedule, cancel) chosen by `createNotificationAdapter.ts` and loaded LAZILY (via
  `getDefaultNotificationAdapter`) so expo-notifications never enters a test or web bundle. Tests inject a
  recording adapter and assert descriptor ROUTING, never OS delivery. `notificationSync.ts` is the
  orchestration seam (permission → data → pure schedule → adapter), tested against a mock.
- The device adapter is the FOURTH device-verifiable surface (after cardio, dashboard, review) and a
  green CI does NOT close it. Static gates cannot verify that a notification actually fires at its local
  time, that a denied permission prompt behaves, or that toggling a type off cancels its pending
  notifications. Signing roadmap 24 off fully means a simulator/device pass: grant permission and confirm
  each enabled reminder arrives at its local fire time, deny permission and confirm graceful no-op, and
  toggle a type off and confirm its notifications are cancelled.
- PER-TYPE, INDEPENDENTLY OPTIONAL, all defaulting OFF. Six owner-scoped boolean columns on `profiles`
  (`notify_sessions`, `notify_weigh_in`, `notify_waist`, `notify_weekly_review`, `notify_readiness`,
  `notify_next_morning`; migration `20260724090000`, following the roadmap-20/22 config-column pattern),
  each toggled by a single-column owner-scoped UPDATE under the existing profiles RLS (no trusted RPC —
  these are the user's own preferences with no safety rule to violate; the pure engine already made every
  safety decision). Turning one on/off never touches another (proven by pgTAP and the repository test).
  DEFAULT OFF is deliberate: notifications are an opt-in convenience the user has not asked for, and the
  OS permission must be granted separately; a private-beta app must not start pinging the user (least of
  all with the health-adjacent readiness/next-morning reminders) without consent (docs/07 §7.7).
- GRACEFUL DENIED PERMISSION is a hard requirement, honoured throughout. The adapter reports the honest
  OS state (`granted` / `denied` / `undetermined`); `syncNotifications` is a no-op when permission is not
  granted (returns `permission-not-granted`, schedules nothing, never errors); every adapter method is
  best-effort and swallows failures. The S-051 screen reflects the real state ("Notifications are off in
  system settings", with a route to system settings via `Linking.openSettings`), offers a clear,
  declinable "Turn on notifications" only when undetermined, and shows a partial/holding banner
  ("reminders will not appear until…") when preferences are saved but permission is not granted. A toggle
  still SAVES while denied — it just does not schedule.
- NO SENSITIVE HEALTH DETAILS IN TEXT is a standing hard rule (docs/07). Every title/body comes from the
  single reviewed source `NOTIFICATION_COPY` in the pure module — deliberately generic ("You have a
  session planned today.", "Your weekly check-in is ready when you are.") — never a weight value, a
  readiness classification (red/amber/green), an Achilles/injury detail, a calorie/target number, or even
  the demanding NATURE of a session. A REQUIRED privacy test scans every generated body+title against a
  forbidden vocabulary (any digit, kg/kcal/calorie/protein/weight, red/amber/green, achilles/tendon/
  injury/pain, strength/running) and fails on any hit. Treat any health value in notification copy as a
  bug; the single copy source is the one place to audit.
- IDEMPOTENT rescheduling. The adapter cancels ALL app-scheduled notifications then applies the current
  set (cancel-and-replace), so recomputing and re-applying never duplicates and always cancels superseded
  notifications (proven against the recording mock). `useNotificationSettings` reschedules on open, on
  every toggle, and when permission is granted. The near-horizon approach is a DECLARED choice: the pure
  module schedules the next 14 days and the hook reschedules on app open to keep the window filled, rather
  than fighting the OS scheduling primitives for far-future recurring notifications. Fire times are named,
  documented constants (sessions 08:00, readiness 07:00 before the session, next-morning 08:00, weigh-in
  07:30 weekly, waist 07:30 fortnightly, weekly review Sunday 18:00), adjustable in one place; the docs do
  not prescribe times.
- Gating mirrors the app's other gates. The readiness reminder fires only for gated sessions
  (`session_type in ('running','strength')`, the classifySession / start_scheduled_session convention);
  cardio, rest and Achilles days are never reminded to pre-check. The weigh-in/waist cadences are
  data-aware (anchored on the last measurement's LOCAL day + the interval), reusing `toIsoDate` for the
  device-local sense of "today" so a reminder fires on the user's local day, never a raw UTC day.
- CLOSED seams: the roadmap-15 next-morning reminder (the `ReadinessResultView` "a reminder will be added
  in a later update" note now points to the Notifications toggle) and a PROMPT for the pre-session
  readiness check. Declared seams left untouched: push / remote notifications (LOCAL ONLY, per the
  prompt); the export/deletion screen (roadmap 25); a hard gate FORCING the pre-session check (the
  reminder prompts, it does not force); distinct cardio activity typing on a substitution (roadmap 15/16
  seam); the invalidating-event capture UI (a future settings surface, which is also the natural home for
  a fuller notification-settings surface). The React hook holds the adapter/repository/clock in refs
  synced by an effect and derives `loadState` during render, so a caller passing a fresh adapter each
  render can neither re-arm the load effect nor loop it (a lesson from an initial infinite-loop bug).

## Export & deletion boundaries carried out of Roadmap 25

How export and deletion work and what they deliberately left for later:

- EXPORT is CLIENT-ASSEMBLED, DELETION is a TRUSTED SERVER ACTION — the two halves of S-053 differ in
  kind (docs/04 §4.2). Export needs no elevated privilege: row-level security already scopes every table
  to `auth.uid() = user_id`, so the client legitimately reads all of its OWN rows. Deletion is
  privileged (it must delete the `auth.users` row), so it goes through a security-DEFINER RPC — NOT an
  Edge Function (none exist in this repo; the definer RPC is consistent with `start_scheduled_session`
  and `submit_readiness_checkin`).
- The versioned export STRUCTURE. `domain/account/accountExport.ts` (`ACCOUNT_EXPORT_VERSION`
  `rebuild-account-export/v1`) is the single documented source of the export shape: a top-level object
  with `exportVersion`, `exportedAt` (passed in — the builder is pure, no clock), `userId`, a
  `description`, the `tables` list, `data` (one key per table), and a `storage` section. `EXPORTED_TABLES`
  is the canonical list of the 27 user-owned tables (verified against the live schema — everything that
  references `auth.users(id) on delete cascade`; the shared `exercises` catalogue is excluded as it is
  reference data, not the user's own). COMPLETENESS is a property of the shape: `buildAccountExport`
  ALWAYS emits every table key (empty array when absent), so an empty account is a valid fully-keyed
  export and a user-owned table added to the app without adding it here fails the "every table present"
  unit test. The builder is a FAITHFUL passthrough — it never invents, merges or filters rows — so
  because the repository fetches only owner-scoped rows (RLS-filtered; the two shared-or-owned
  `workout_templates`/`workout_template_exercises` are additionally `.eq('user_id')`), no cross-user row
  can appear. The prepared JSON is shared via React Native's built-in Share API (a DECLARED minimal
  mechanism — a file-based export via expo-file-system/expo-sharing is the sanctioned next step, the same
  no-casual-dependency stance as roadmap 21; the DATA correctness is what the tests pin down).
- The DELETION primitive is the 27-table `auth.users` cascade. `delete_account()` (migration
  `20260725090000`, `security definer`, `search_path = ''`, granted to `authenticated`, anon/public
  revoked) captures `auth.uid()` and runs a single `delete from auth.users where id = auth.uid()`. Every
  user-owned table declares `user_id ... references auth.users(id) on delete cascade`, so that one delete
  removes ALL of the caller's rows across ALL 27 tables in one transaction — including `audit_events`
  (docs/05 §5.11 requires personal-data audit rows to be deleted too). There is no per-table delete list
  to keep in sync, so no table can be forgotten and left holding orphaned personal data. Only the
  caller's own row is ever named. No audit event is written post-deletion (the audit rows are themselves
  deleted); a pre-deletion audit was not added (not required, and deletion must not block on it).
- STORAGE OBJECTS and the progress-photos gap. docs/05 §5.11 / §7.9 require removing storage objects on
  deletion. PROGRESS PHOTOGRAPHS (docs/05 §5.8) were SPECCED but NEVER BUILT — there is no
  `progress_photos` table and no storage bucket after 25 roadmaps, and this roadmap deliberately did NOT
  build the photo-capture feature (an unscheduled item). Deletion still handles storage CORRECTLY for
  when it lands: `accountRepository.clearOwnStorage` lists and removes the caller's own objects under
  their prefix in the `progress-photos` bucket over the AUTHENTICATED Storage API, BEFORE the RPC (after
  which the session is gone and storage is unreachable). This is done client-side, NOT in SQL, because
  deleting a `storage.objects` row does not remove the underlying file — only the Storage API does; a
  SQL-only cascade would orphan the actual files. It is a correct NO-OP today (no bucket) and becomes
  real the moment a private progress-photos bucket lands, with no change to `delete_account`. Storage
  removal is BEST-EFFORT — a missing bucket or a storage hiccup never blocks the DB deletion, so an
  account is never left half-deleted. The progress-photos CAPTURE feature is a declared roadmap gap.
- The RECENT-AUTH gate (docs/07 §7.8). The client flow requires a FRESH re-authentication immediately
  before the destructive confirm: the user re-enters their password, routed through
  `authService.signInWithPassword` via `AuthProvider.signIn`, in the SAME flow. `useAccountDeletion` only
  calls `deleteAccount` after that sign-in succeeds; a failed re-auth aborts and deletes nothing (proven
  by a hook test). The flow is multi-step and cancellable up to the final confirm — no accidental
  single-tap deletion. The RPC itself has no session freshness to check, so the gate lives in the flow.
- `features/account/` mirrors the other features: narrow `AccountBackend` + Supabase adapter
  (`accountRepository.ts`), a composed repository (`exportData` reads every table then shapes with the
  pure builder; `deleteAccount` clears storage then calls the RPC), `useAccountExport` /
  `useAccountDeletion` hooks, and a pure `AccountDataView` (S-053, all §3.3 states, British English, calm
  but unambiguous destructive copy conveying danger by icon+text). Wired into More → "Your data".
- TESTS. The pure builder (full shape, versioning, empty account → valid empty export, every owned table
  present, faithful passthrough / no cross-user mixing); the repository (reads all 27 owner-scoped,
  offline/error honesty, storage-cleared-before-RPC ordering, deletion offline/error); the re-auth gate
  at the hook level (no delete without a fresh sign-in); the view states + confirm + re-auth. The
  load-bearing one is the pgTAP INTEGRATION test (`supabase/tests/delete_account.test.sql`): a user is
  seeded with a row in EVERY one of the 27 tables, `delete_account()` is called as that user, and every
  table is asserted empty for them afterwards (grand-total plus the deepest FK-chain leaves individually)
  while a second user's rows are entirely untouched — the cascade-completeness + isolation assertion,
  because a table that failed to cascade would leave orphaned personal data. Owner isolation and anon
  denial are covered. `database.types.ts` was regenerated for the new RPC.
- Declared seams: (1) the progress-photos CAPTURE feature is unbuilt (deletion/export handle storage
  correctly for when it exists). (2) EXPORT RATE-LIMITING (docs/07 §7.8) — there is no server function to
  enforce it on yet; when one is added it belongs at the trusted boundary (a definer guard on the RPC, or
  an Edge Function / gateway rule), flagged in the migration and here. (3) No Edge Functions were
  introduced — the definer RPC is used. (4) The share mechanism is minimal (Share API, not a saved file).

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
