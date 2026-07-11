# 3. Information Architecture and Screen Specifications

## 3.1 Primary navigation

Use a five-item bottom tab bar:

1. **Today**
2. **Plan**
3. **Log**
4. **Progress**
5. **More**

The primary action on Today is always visually dominant. Avoid placing the AI coach in the main navigation during MVP.

## 3.2 Screen inventory

### Onboarding

#### S-001 Welcome

Purpose: explain the product in one sentence and begin secure setup.

Content:

- Working logo and product name.
- “Your training, food and recovery plan in one place.”
- Create account and sign-in actions.
- Privacy and wellness links.

Acceptance criteria:

- No health data is requested before authentication.
- The user can leave and resume onboarding.

#### S-002 Goals and measurements

Fields:

- Height
- Current weight
- Waist
- Target weight
- Main objective
- Preferred rate of progress

Show unit explanations and do not use body-shaming labels.

#### S-003 Availability and equipment

Fields:

- Available training days
- Preferred session duration
- Gym access
- Home equipment
- Preferred cardio options

#### S-004 Achilles and current capability

Fields:

- Previous injury acknowledgement
- Current pain and stiffness
- Walking tolerance
- Single-leg calf-raise capability
- Existing professional restrictions

Display: “This information helps the app choose conservative general fitness options. It does not assess whether the tendon is healed.”

#### S-005 Plan confirmation

Show the first four weeks and a concise explanation of later progression. The user confirms before sessions are scheduled.

### Main application

#### S-010 Today

Sections, in order:

1. Date and greeting.
2. Today's planned session card.
3. Start, reschedule or recovery-option actions.
4. Calories and protein progress.
5. Steps or activity progress when available.
6. Achilles status where relevant.
7. Weekly adherence summary.

Empty state: no session planned, offer an easy walk or mobility session without implying a requirement.

#### S-011 Readiness check

Use one question per screen or a short accessible form. Inputs:

- Pain, 0 to 10
- Morning stiffness, better, same or worse
- Swelling, none, mild or significant
- Walking, normal or altered
- Sudden new change, yes or no
- Confidence, 1 to 5

Result screen:

- Green, amber or red label
- Plain explanation
- Allowed action
- Alternatives
- Professional-care message where needed

Do not rely on colour alone. Use icon, heading and text.

#### S-012 Strength workout player

Header:

- Workout name
- Elapsed time
- Exercise number
- End workout menu

Exercise card:

- Name
- Illustration or video placeholder
- Setup steps
- Target sets and repetitions
- Previous result
- Current weight and repetitions controls
- Effort selector
- Discomfort action
- Rest timer
- Replace exercise

Offline behaviour: all active workout data is saved locally and synchronised later.

#### S-013 Exercise guide

Sections:

- Equipment setup
- Starting position
- Movement
- Breathing
- Common mistakes
- Stop criteria
- Approved alternatives

Language should assume no prior gym knowledge.

#### S-014 Cardio session player

Support walk, bike, cross-trainer and run-walk.

Display:

- Current interval
- Remaining interval time
- Total elapsed time
- Next interval
- Pause and end
- Optional heart rate and distance later

Audio and haptic cues must work with the screen locked where platform rules permit.

#### S-015 Post-session check

Fields:

- Session effort
- Achilles response
- General discomfort
- Notes
- “Schedule next-morning check” for run and lower-body sessions

#### S-020 Weekly plan

Show seven days as vertically stacked cards on phone. Each card shows session, duration and state.

Actions:

- Move
- Replace
- Skip
- View details

Conflict messages must explain why a move is discouraged, for example, “This would place two running sessions on consecutive days.”

#### S-021 Calendar

Monthly overview for completed, planned and recovery days. Detailed scheduling remains in the weekly plan.

### Logging

#### S-030 Log hub

Four large actions:

- Food
- Lager or alcohol
- Weight
- Waist

Recent entries appear below.

#### S-031 Food diary

Display meals by breakfast, lunch, dinner and snacks.

Each meal shows calories and protein. Daily totals remain visible.

MVP entry methods:

- Search personal foods
- Add custom food
- Add saved meal
- Quick calories and protein

#### S-032 Add or edit food

Fields:

- Food name
- Serving description
- Calories
- Protein
- Optional carbohydrate and fat
- Meal
- Date and time

#### S-033 Lager and alcohol log

Fields:

- Drink name
- Type
- Volume
- ABV
- Calories, calculated or manually corrected
- Occasion note

Show estimated UK units and remaining personal weekly allowance.

#### S-034 Measurement entry

Weight and waist are separate simple forms. Show the most recent value and measurement guidance.

### Progress

#### S-040 Progress overview

Cards:

- Weight trend
- Waist trend
- Sessions completed
- Strength improvement
- Cardio minutes
- Protein adherence
- Lager total
- Achilles status trend

Each card opens a detailed chart or history.

#### S-041 Weekly review

Sections:

1. What happened
2. What improved
3. What needs attention
4. Safety and recovery
5. Proposed plan change
6. Confirmation

Every proposed change must display its input evidence.

#### S-042 Progress photographs

Private gallery with explicit consent, camera guidance and delete controls. This screen can be deferred if it delays the MVP.

### More

#### S-050 Profile and goals
#### S-051 Notifications
#### S-052 Equipment and exercise preferences
#### S-053 Data export and account deletion
#### S-054 Privacy, wellness boundaries and help
#### S-055 Developer diagnostics, private beta only

## 3.3 Design state requirements

Every data-driven screen must define:

- Loading state
- Empty state
- Partial-data state
- Offline state
- Error state with retry
- Success confirmation where an action changes data

## 3.4 Interaction rules

- Do not hide essential actions behind swipe gestures.
- Do not use red for ordinary missed targets. Reserve it for genuine safety or destructive actions.
- Confirm destructive actions.
- Make rest timers and interval timers operable with one hand.
- Do not require precise sliders for important numeric data; provide plus, minus and direct entry.
- Preserve partially completed forms and workouts.
