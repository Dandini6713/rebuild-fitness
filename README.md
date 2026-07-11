# Rebuild Fitness App Development Pack

**Working title:** Rebuild  
**Product type:** Private, personalised fitness and nutrition application  
**Primary platform:** iPhone  
**Secondary platform:** Android after the private beta  
**Proposed stack:** React Native, Expo, TypeScript, Supabase  
**Primary build agent:** Codex  
**Secondary review agent:** Claude Code

## Purpose

Rebuild is designed for an adult beginner who wants to lose abdominal fat, improve cardiovascular fitness, build useful muscle and return to running cautiously after a previous Achilles rupture. It combines a simple weekly planner, guided strength workouts, walk-to-run progression, calorie and protein tracking, lager tracking, weight and waist trends, and a rules-based recovery system.

The private MVP is configured around Danny's current situation:

- Height: 183 cm
- Starting weight: approximately 90 kg
- Initial target: 85 kg
- Training experience: beginner
- Gym confidence: low
- Previous injury: right Achilles rupture, treated non-surgically
- Available home equipment: two 10 kg dumbbells
- Work pattern: Monday to Friday, approximately 08:30 to 15:30
- Planned starting frequency: two strength sessions, two or three low-impact cardio sessions, and Achilles work each week
- Nutrition emphasis: modest calorie deficit, approximately 130 to 145 g protein daily, and honest tracking of lager

This repository pack is a product and engineering specification. It does not contain a finished application.

## Local development

### Prerequisites

- Node.js 22 LTS
- npm 10 or later
- Xcode and an iOS Simulator for local iPhone development, or the Expo Go app on a physical device

### Install and run

From the repository root, install the locked dependencies:

```bash
npm ci
```

Start the Expo development server:

```bash
npm start
```

Then press `i` in the Expo terminal to open the iOS Simulator, scan the displayed QR code with a compatible Expo Go client, or run the simulator directly with:

```bash
npm run ios
```

The web and Android development targets can be started with `npm run web` and `npm run android` respectively.

### Supabase client setup

The app starts safely without Supabase configuration and shows a setup-required diagnostic. To connect it to a hosted project:

1. Create a private project in the [Supabase dashboard](https://supabase.com/dashboard).
2. Open the project's **Connect** panel and copy its Project URL and publishable key.
3. Copy `.env.example` to `.env`.
4. Set the two public variables:

   ```dotenv
   EXPO_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
   EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_public_key
   ```

5. Restart Expo with `npm start -- --clear` so the variables are embedded in the client bundle.
6. Open **Settings → Developer diagnostics** and run **Check connection**.

Only use a publishable client key. Never put a `service_role` key, an `sb_secret_…` key, a database password or another private credential in an `EXPO_PUBLIC_` variable. The mobile client still depends on row-level security; a publishable key does not bypass database policies.

### Local Supabase development

Local Supabase requires Docker Desktop or another Docker-compatible runtime. The repository includes the Supabase CLI and a private-beta configuration with public sign-up disabled.

```bash
npm run supabase:start
npm run supabase:status
```

Copy the local API URL and publishable key shown by `supabase:status` into `.env`. Stop the stack with `npm run supabase:stop`.

Database changes must be recorded as ordered migrations:

```bash
npm run supabase:migration:new -- descriptive_migration_name
npm run supabase:db:reset
npm run supabase:types
```

Prompt 02 intentionally does not convert `supabase/schema.sql` into a migration or run `supabase/seed.sql`; that work belongs to Prompt 03. Until migrations exist, generated `Database` types expose no tables. After a migration is applied, regenerate `lib/supabase/database.types.ts` with `npm run supabase:types` and commit the result.

To connect the CLI to the hosted project later, run `npx supabase login`, then `npx supabase link --project-ref <project-ref>`. Review all migrations and row-level security policies before using `npx supabase db push`.

### Quality checks

Run the same checks used by continuous integration:

```bash
npm run format:check
npm run lint
npm run typecheck
npm test -- --runInBand
```

Use `npm run format` to apply Prettier formatting. Authentication and the AI coach are deliberately not configured in this foundation.

## Documents

1. `docs/01_PRODUCT_REQUIREMENTS.md`, formal product requirements and acceptance criteria.
2. `docs/02_PERSONA_AND_USER_JOURNEYS.md`, primary persona, jobs to be done and end-to-end journeys.
3. `docs/03_SCREENS_AND_INFORMATION_ARCHITECTURE.md`, navigation and screen-by-screen specification.
4. `docs/04_TECHNICAL_ARCHITECTURE.md`, application architecture, services and engineering conventions.
5. `docs/05_DATABASE_SCHEMA.md`, database model, relationships and row-level security expectations.
6. `docs/06_RULES_ENGINE.md`, deterministic training, recovery and nutrition adjustment logic.
7. `docs/07_SAFETY_PRIVACY_AND_BOUNDARIES.md`, Achilles safety, wellness boundaries and privacy requirements.
8. `docs/08_AI_COACH_SPECIFICATION.md`, approved AI use cases, tools, guardrails and output formats.
9. `docs/09_DESIGN_SYSTEM.md`, visual direction, components, language and accessibility.
10. `docs/10_TEST_PLAN.md`, unit, integration, safety, usability and device testing.
11. `docs/11_BUILD_ROADMAP.md`, phased implementation order and release gates.
12. `prompts/01_CODEX_BUILD_PROMPTS.md`, sequenced implementation prompts.
13. `prompts/02_CLAUDE_CODE_REVIEW_PROMPTS.md`, architecture, safety, privacy and code-review prompts.
14. `AGENTS.md`, repository-wide instructions for coding agents.
15. `supabase/schema.sql`, starter PostgreSQL schema with row-level security.
16. `supabase/seed.sql`, sample private-MVP seed data.
17. `app-spec.json`, machine-readable product constants and MVP configuration.

## Recommended workflow

1. Create a new Git repository.
2. Copy this pack into the repository root.
3. Read `AGENTS.md`, then complete the Codex prompts in order.
4. Commit after every completed prompt.
5. Run the Claude Code review prompts at the end of each phase.
6. Do not enable public sign-up until the privacy, safety and security release gates have passed.

## Product principles

- The app must answer, “What should I do today?” within a few seconds.
- Safety-critical progression is rules-based and testable.
- AI explains and assists, but does not diagnose or override safety rules.
- Weight is shown as a trend, not treated as a daily judgement.
- Waist, strength, adherence and fitness matter alongside body weight.
- Lager is tracked honestly and without moralising.
- The interface must feel suitable for a normal adult beginner, not a bodybuilding audience.
- British English is used throughout.
