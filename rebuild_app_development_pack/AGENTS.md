# Coding Agent Instructions

## Product context

You are building **Rebuild**, a private iPhone-first fitness, nutrition and recovery application. Read every file in `docs/` before implementing material functionality. The application is initially for one user but must use sound multi-user data isolation from the beginning.

## Non-negotiable rules

1. Use TypeScript in strict mode. Do not introduce `any` unless an isolated third-party boundary makes it unavoidable and the reason is documented.
2. Treat `docs/06_RULES_ENGINE.md` as the source of truth for training progression, Achilles traffic-light logic and calorie adjustments.
3. Treat `docs/07_SAFETY_PRIVACY_AND_BOUNDARIES.md` as mandatory. Do not weaken or bypass safety rules.
4. The AI coach may only act through approved tools described in `docs/08_AI_COACH_SPECIFICATION.md`.
5. Do not allow the model to write arbitrary database values or execute unvalidated actions.
6. All user-owned database tables must include `user_id` and be protected with Supabase row-level security.
7. Never store service-role keys, AI API keys or private credentials in the mobile application.
8. Use British English in user-facing copy.
9. Do not use shame-based, punitive or appearance-insulting language.
10. Do not describe the application as diagnosing, treating, rehabilitating or preventing injury.
11. Every feature must include loading, empty, error and offline states where applicable.
12. Every prompt or migration must be idempotent or clearly document when it is not.
13. Add automated tests for every rules-engine change.
14. Avoid large, unreviewable commits. Complete one prompt, test it, then commit it.

## Engineering standards

- Prefer small pure functions for calculations and rules.
- Keep domain logic outside React components.
- Store dates in UTC and display them in the user's selected time zone.
- Use integer values for calories and grams where practical.
- Store weight in kilograms and waist in centimetres as decimal values.
- Store alcohol volume in millilitres and ABV as a decimal percentage.
- Validate all external data with schemas, preferably Zod.
- Use migrations for database changes.
- Use generated Supabase types and keep them current.
- Add accessible labels, focus order and sufficient touch targets.
- Maintain a simple audit trail for plan adjustments and AI-assisted actions.

## Definition of done

A task is complete only when:

- Acceptance criteria are satisfied.
- Type checking and linting pass.
- Relevant tests pass.
- Database migrations apply cleanly where relevant.
- No secrets or personal data are committed.
- Loading, empty and error states are included.
- Safety and privacy implications are documented.
- Relevant mobile features are tested on an iPhone simulator or physical iPhone.
