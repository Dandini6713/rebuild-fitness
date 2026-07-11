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
