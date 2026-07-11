# 6. Deterministic Rules Engine

## 6.1 Purpose

Safety, progression and calorie changes must be produced by versioned, testable rules. AI may explain the result but may not choose a different result.

Each decision returns:

- Decision code
- Classification or recommendation
- Human-readable reasons
- Inputs used
- Rule version
- Suggested next action

## 6.2 Achilles readiness classification

### Inputs

- Pain score, 0 to 10
- Morning stiffness change
- Swelling level
- Walking status
- Sudden new change
- Confidence score
- Session type
- Previous next-morning response

### Red classification

Return red when any of the following is true:

- Sudden new pulling, popping or severe change is reported.
- Walking is altered and pain is 4 or higher.
- Significant new swelling is reported.
- Pain is 6 or higher.
- The user explicitly states they cannot load the leg normally.

Result:

- Do not start the planned running or lower-body session.
- Show concise professional-care guidance.
- Permit logging and viewing only.
- Do not diagnose the cause.

### Amber classification

Return amber when red criteria are absent and any of the following is true:

- Pain is 3 to 5.
- Morning stiffness is worse.
- Mild new swelling is present.
- Walking feels abnormal but is not clearly limping.
- Confidence is 1 or 2 out of 5.
- The previous run produced a material next-morning increase.

Result:

- Replace running with flat walking, easy cycling or rest.
- Reduce lower-body volume by 30 to 50 per cent where a safe alternative exists.
- Do not progress the running week.
- Schedule a next-morning check.

### Green classification

Return green only when:

- Pain is 0 to 2.
- No sudden change is reported.
- No significant swelling is reported.
- Walking is normal.
- Stiffness is the same or better.

Green permits the planned session but does not guarantee safety.

### Rule precedence

Red overrides amber. Amber overrides green. Missing required answers prevents classification.

## 6.3 Running progression

### Initial programme

The private plan begins with walking and low-impact cardio. Running is enabled only after the configured readiness gate is manually confirmed.

Proposed run-walk stages:

1. Run 1 minute, walk 2 minutes, eight repeats.
2. Run 90 seconds, walk 2 minutes, eight repeats.
3. Run 2 minutes, walk 2 minutes, seven repeats.
4. Run 3 minutes, walk 2 minutes, six repeats.
5. Run 5 minutes, walk 2 minutes, four repeats.
6. Run 8 minutes, walk 2 minutes, three repeats.
7. Run 12 minutes, walk 2 minutes, twice.
8. Continuous easy run, 20 minutes.
9. Continuous easy run, 25 to 30 minutes.

### Progress to next stage only when

- Required sessions were completed.
- Both pre-session classifications were green.
- No red post-session or next-morning response occurred.
- No more than one amber response occurred and it resolved before the next session.
- Average reported effort was no higher than 7 out of 10.
- The user confirms readiness to progress.

### Repeat stage when

- One planned session was missed.
- Effort was 8 or higher.
- There was a temporary amber response.
- The user lacks confidence.

### Regress or pause when

- A red response occurs.
- Two amber responses occur in the same stage.
- Altered walking is reported after a session.
- The user chooses to pause.

Runs should not be scheduled on consecutive days. Running volume should not increase in the same week as a substantial lower-body strength increase.

## 6.4 Strength progression

Each exercise has a repetition range, usually 8 to 12, an effort target and a permitted weight increment.

### Increase weight when

- All prescribed sets reach the top of the repetition range.
- Technique is marked controlled.
- Effort is no higher than 8 out of 10.
- Discomfort is 0 to 2.
- The same performance standard is achieved in two exposures, unless the exercise is explicitly configured for single-exposure progression.

### Hold weight when

- Repetitions are within range but not at the top.
- Effort is 8 or 9.
- Technique is uncertain.
- The session occurred after poor sleep or an amber readiness classification.

### Reduce or substitute when

- Discomfort is 4 or higher.
- A movement produces sharp pain.
- Target repetitions cannot be reached with controlled technique.
- The user selects “not confident with this exercise”.

No automatic increase may exceed the exercise's configured increment.

## 6.5 Weekly scheduling rules

Hard rules:

- No two running sessions on consecutive days.
- At least one full rest or gentle-recovery day per seven-day period.
- A red readiness result cancels or replaces the affected session.
- Do not schedule two demanding lower-body sessions on the same day.

Soft warnings:

- Avoid demanding lower-body strength the day before a run.
- Avoid increasing both running stage and lower-body strength volume in the same week.
- Keep the total number of demanding sessions at three or fewer during the early phase.

The user may override soft warnings but not red safety blocks.

## 6.6 Weight trend

Use a robust rolling trend rather than the latest measurement. The first implementation may use a seven-day exponentially weighted moving average, provided tests demonstrate sensible behaviour with missing days.

Do not generate conclusions from fewer than three weights in seven days or fewer than six weights across fourteen days.

## 6.7 Calorie adjustment rules

### Data sufficiency

A target change is eligible only when:

- At least fourteen days have passed since the current target began.
- Weight logging meets the minimum requirement.
- Nutrition is logged on at least ten of fourteen days.
- There is no clear illness, travel or unusual event flag invalidating the period.

### Target rate

Default desired loss range: 0.2 to 0.6 kg per week.

### Adjustment

- If loss is within range, no change.
- If loss is below 0.1 kg per week and adherence is at least 80 per cent, propose a reduction of 100 to 150 kcal per day.
- If weight is increasing and adherence is at least 80 per cent, propose a reduction of up to 150 kcal per day.
- If loss exceeds 0.8 kg per week, propose an increase of 100 to 150 kcal per day or a review of logging accuracy.
- Never propose a target below a configured safety floor without professional review.
- Never apply a change automatically.

The private configuration should use a conservative calorie floor and allow the user to disable adaptive adjustments.

## 6.8 Protein target

The initial target is configurable and begins at approximately 140 g per day. The weekly report uses a seven-day average and number of days within ten per cent of target.

## 6.9 Alcohol units and weekly effect

UK units are calculated as:

`volume in millilitres × ABV percentage / 1000`

Example: 568 ml at 5 per cent equals approximately 2.84 units.

The weekly summary shows:

- Total drinks
- Total units
- Estimated calories
- Alcohol-free days
- Percentage of personal limit

No rule may recommend fasting, meal skipping, dehydration or compensatory over-exercise.

## 6.10 Rule versioning

Use semantic rule versions, for example `readiness-1.0.0`. Store the version with every decision. A rule change requires:

- Updated documentation
- Unit tests
- Migration or compatibility review
- Release note
