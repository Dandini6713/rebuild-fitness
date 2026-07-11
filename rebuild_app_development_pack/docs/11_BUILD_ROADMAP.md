# 11. Build Roadmap

## Phase 0: Repository and decisions

Deliverables:

- Git repository
- Expo TypeScript application
- Environment templates
- Formatting, linting and tests
- Architecture decision records
- Supabase local and hosted projects

Exit gate: clean build, type check and test command.

## Phase 1: Secure foundation

Deliverables:

- Authentication
- Profile and onboarding database
- Row-level security
- Account session handling
- Private beta feature flag

Exit gate: two test accounts cannot access each other's records.

## Phase 2: Static plan and Today

Deliverables:

- Seeded twelve-week private plan
- Today screen
- Weekly plan screen
- Session state transitions
- Rescheduling with hard and soft conflict messages

Exit gate: the complete first week can be viewed and rearranged.

## Phase 3: Strength workout logging

Deliverables:

- Exercise catalogue
- Strength A and B templates
- Workout player
- Set logging
- Rest timer
- Exercise guide
- Approved substitutions
- Local persistence

Exit gate: a full workout survives airplane mode and app backgrounding.

## Phase 4: Achilles readiness and cardio

Deliverables:

- Readiness forms
- Versioned classifier
- Green, amber and red result flows
- Low-impact alternatives
- Cardio and run-walk interval player
- Post-session and next-morning checks

Exit gate: all safety scenarios pass and a red session cannot start.

## Phase 5: Nutrition, lager and measurements

Deliverables:

- Personal food catalogue
- Meal and quick logging
- Calories and protein totals
- Alcohol calculations
- Weight and waist logging
- Rolling weight trend

Exit gate: seven days of data produce correct totals and charts.

## Phase 6: Weekly review and adjustments

Deliverables:

- Adherence calculations
- Strength and running progression proposals
- Calorie adjustment eligibility
- Weekly review screen
- User confirmation and audit trail

Exit gate: every recommendation shows its evidence and rule version.

## Phase 7: Notifications, export and quality

Deliverables:

- Local reminders
- Data export
- Account deletion
- Accessibility pass
- Error and offline states
- Physical-device test

Exit gate: private MVP is safe and usable without developer intervention.

## Phase 8: Apple Health

Deliverables:

- Permission education
- Step and workout imports
- Duplicate detection
- Optional weight import
- Sync diagnostics

Exit gate: denied permission does not impair the rest of the app.

## Phase 9: AI coach

Deliverables:

- Provider adapter
- Approved tool functions
- Structured outputs
- Confirmation flow
- Audit trail
- Fixed safety evaluation suite

Exit gate: the AI cannot bypass a domain rule or make an unconfirmed change.

## Phase 10: Commercial decision

Only begin after at least eight weeks of real private use. Review:

- Features used daily
- Features ignored
- Logging burden
- Safety incidents or confusion
- Retention and outcome evidence
- Cost of food data and AI
- Public privacy and regulatory requirements

## Suggested milestone order

- Milestone 1: open app and see a realistic week.
- Milestone 2: complete a full strength session.
- Milestone 3: complete a safe readiness and cardio flow.
- Milestone 4: track a full week of nutrition, lager and measurements.
- Milestone 5: receive a transparent weekly review.
- Milestone 6: add integrations only after the manual process works.
