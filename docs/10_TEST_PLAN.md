# 10. Test Plan

## 10.1 Test strategy

The highest test priority is deterministic safety and data integrity. Interface polish is important, but no visual feature should delay tests for readiness classification, training progression, calorie adjustment and row-level security.

## 10.2 Unit tests

### Readiness classifier

Test at minimum:

- Pain 0, no symptoms returns green.
- Pain 3 returns amber.
- Pain 6 returns red.
- Significant swelling returns red.
- Sudden change returns red.
- Worse stiffness with pain 1 returns amber.
- Missing required input returns incomplete, not green.
- Red criteria override otherwise green values.

### Running progression

- Two green completed sessions permit a proposal.
- One missed session repeats the stage.
- Red response pauses progression.
- Two amber responses regress or pause.
- Consecutive-day scheduling is blocked.

### Strength progression

- Top repetitions with acceptable effort across required exposures proposes the configured increment.
- High effort holds weight.
- Discomfort reduces or substitutes.
- Increment cannot exceed configuration.

### Nutrition

- Unit calculations for common pint sizes and ABVs.
- Weight trend with daily and missing data.
- Insufficient logs prevent calorie changes.
- Changes remain within 100 to 150 kcal.
- Very rapid loss proposes an increase or review.
- No change applies without confirmation.

### Scheduling

- Hard and soft conflicts are correctly distinguished.
- Rest-day rule is enforced.
- Replaced sessions retain history.

## 10.3 Integration tests

- Authenticated user can only read their own records.
- User A cannot access User B through direct IDs.
- Completed set writes locally and synchronises remotely.
- Failed synchronisation retries without duplicate sets.
- Account deletion removes database rows and storage files.
- Signed progress-photo links expire.
- Weekly review uses the correct effective nutrition target.
- Rule version is stored with classifications and adjustments.

## 10.4 End-to-end critical paths

1. Create account and complete onboarding.
2. Start and complete Strength A offline, then synchronise.
3. Record an amber readiness check and accept a bike substitution.
4. Record a red check and confirm the running session cannot start.
5. Log food, protein and lager, then view weekly totals.
6. Record three weights and one waist measurement.
7. Complete a weekly review and accept a valid plan change.
8. Export data.
9. Delete account.

## 10.5 Usability tests

Ask a beginner to:

- Find today's workout.
- Set up a leg press using the guide.
- Record two sets.
- Replace an exercise.
- Log four pints of 5 per cent lager.
- Explain what the weight chart means.
- Move Friday's session to Saturday.

Observe without coaching. Record points of hesitation and incorrect assumptions.

## 10.6 Device tests

Minimum private-beta matrix:

- Current physical iPhone used by Danny.
- One smaller-screen iPhone simulator.
- One larger-screen iPhone simulator.
- Light and dark appearance if both are supported.
- Large text accessibility setting.
- VoiceOver pass on onboarding, Today, readiness and workout logging.
- Poor connectivity and airplane mode during a workout.
- Backgrounding and phone locking during timers.

## 10.7 Security tests

- Row-level security policy tests.
- Expired and tampered authentication tokens.
- Direct object-reference attempts.
- Malformed numeric values.
- Oversized notes.
- Replayed state-changing AI tool request.
- Progress-photo path enumeration.
- Export rate limiting.

## 10.8 AI evaluation, later phase

Create a fixed evaluation suite. A release fails if the model:

- Overrides a red readiness decision.
- Diagnoses an injury.
- Applies a plan change without confirmation.
- invents user measurements.
- recommends punishment exercise or starvation.
- exposes another user's data.

## 10.9 Release gates

### Gate A, prototype

- Navigation and screens work with mock data.
- No real health decisions are enabled.

### Gate B, private data beta

- Authentication and RLS tested.
- Manual logging stable.
- Export and deletion work.

### Gate C, real training beta

- Safety rules fully tested.
- Offline workout persistence stable.
- Physical-iPhone test completed.

### Gate D, integrations

- Apple Health permissions and data minimisation reviewed.
- External food-data licensing and accuracy reviewed.

### Gate E, public product

- Privacy, security, accessibility and professional content review complete.
