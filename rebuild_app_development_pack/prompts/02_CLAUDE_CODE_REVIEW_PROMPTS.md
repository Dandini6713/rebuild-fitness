# Claude Code Review Prompt Sequence

Use these prompts after the corresponding build phases. Claude Code should review and propose changes in a separate branch or produce a report before editing.

## Review 01: Architecture and repository health

> Read the complete repository, `AGENTS.md` and `docs/04_TECHNICAL_ARCHITECTURE.md`. Review module boundaries, TypeScript strictness, dependency choices, local persistence and Supabase integration. Identify architecture drift, duplicated domain logic and security risks. Rank findings as critical, high, medium or low. Do not change files until the report is accepted.

## Review 02: Database and row-level security

> Audit every migration and database access path against `docs/05_DATABASE_SCHEMA.md`. Attempt to identify cross-user access, missing ownership checks, insecure storage policies, unsafe functions and service-role leakage. Provide exact SQL or code locations. Treat any cross-user access as critical.

## Review 03: Achilles safety logic

> Compare the implementation and tests line by line with `docs/06_RULES_ENGINE.md` and `docs/07_SAFETY_PRIVACY_AND_BOUNDARIES.md`. Find any path that can classify incomplete data as green, bypass readiness, start a blocked session or let interface code override the classifier. Produce additional adversarial test cases.

## Review 04: Training progression

> Audit strength and running progression for incorrect thresholds, unsafe combined increases, missing confirmations and lost rule versions. Confirm that proposals do not apply automatically. Review scheduling hard and soft conflicts.

## Review 05: Nutrition and alcohol

> Audit weight trends, logging-completeness calculations, calorie adjustment thresholds and alcohol-unit calculations. Check for punitive or judgemental copy. Confirm no low-confidence period can trigger a calorie reduction.

## Review 06: Offline and synchronisation

> Review active-workout persistence, retries, conflict handling and duplicate prevention. Simulate app backgrounding, network loss and repeated sync requests. Identify any path that could lose or duplicate workout sets or logs.

## Review 07: Accessibility and content

> Review all user-facing screens against `docs/09_DESIGN_SYSTEM.md`. Check British English, screen-reader labels, dynamic text, contrast roles, touch targets, status communication without colour, and plain beginner instructions.

## Review 08: Privacy and deletion

> Trace every category of personal data from collection to storage, logs, analytics, export and deletion. Confirm progress photographs are private and deleted correctly. Identify excessive collection or sensitive data in logs.

## Review 09: AI coach boundary

> Review the AI implementation against `docs/08_AI_COACH_SPECIFICATION.md`. Attempt prompt injection, tool-argument manipulation, cross-user retrieval, unconfirmed state changes, diagnosis requests and requests to override red safety decisions. Add tests for every identified weakness.

## Review 10: Release readiness

> Evaluate the repository against every release gate in `docs/10_TEST_PLAN.md`. Produce a concise go or no-go report with evidence. A critical safety, privacy, authentication or data-loss problem is an automatic no-go.
