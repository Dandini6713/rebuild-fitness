# 1. Product Requirements Document

## 1.1 Product summary

Rebuild is a personalised fitness and nutrition application for an adult beginner returning to exercise after a previous Achilles injury. It provides a clear daily plan, guided strength sessions, cautious walk-to-run progression, Achilles check-ins, calorie and protein tracking, lager tracking, body measurements and weekly adjustments.

The first release is a private application for Danny. It should be designed cleanly enough to support multiple users later, but commercialisation is explicitly outside the first release.

## 1.2 Problem statement

The user wants to reduce waist size, lose approximately 5 to 8 kg of fat, gain or retain muscle, improve cardiovascular fitness and rebuild confidence after an Achilles rupture. Existing apps divide these needs across separate products, often assume prior gym knowledge, and rarely combine injury-conscious progression with honest alcohol tracking.

The user needs one application that makes the next action obvious, reduces uncertainty in the gym and shows whether the overall plan is working.

## 1.3 Objectives

### Primary objectives

- Make the correct daily action immediately clear.
- Support sustainable weight and waist reduction.
- Build strength through two beginner-friendly full-body sessions each week.
- Progress from walking and low-impact cardio towards continuous running when readiness criteria are met.
- Track Achilles symptoms without diagnosing the injury.
- Track calories, protein and lager in the same weekly context.
- Use trends and adherence to guide conservative plan adjustments.

### Secondary objectives

- Improve gym confidence through plain instructions and exercise alternatives.
- Reduce the number of separate apps and notes required.
- Integrate Apple Health after the core manual workflow is reliable.
- Produce useful weekly summaries without judgemental language.

## 1.4 Success metrics

### Product engagement

- At least 80 per cent of planned weekly sessions are completed or deliberately rescheduled.
- The Today screen is opened on at least five days per week.
- A workout can be started within three taps of opening the app.
- A standard strength set can be logged in under five seconds.

### Health-behaviour metrics

- Weight is entered at least three times per week.
- Waist is entered at least once per week.
- Nutrition is logged on at least five days per week during the first eight weeks.
- Protein target is achieved on at least four days per week by Week 6.
- Lager is logged on every drinking day.

### Outcome metrics

- Weight trend decreases at approximately 0.2 to 0.6 kg per week after the initial settling period.
- Waist measurement trends down over twelve weeks.
- Strength performance improves in at least four core exercises.
- Cardio tolerance improves without a sustained deterioration in Achilles symptoms.
- The user reports increased confidence using gym equipment.

The app must not promise that these outcomes will occur.

## 1.5 Primary user

The initial user is a 47-year-old man, 183 cm tall and approximately 90 kg. He works weekday hours, has limited gym experience, owns two 10 kg dumbbells, enjoys lager and is cautious after a previous right Achilles rupture. He wants practical direction rather than fitness culture, competition or social features.

## 1.6 MVP scope

### Included

- Secure sign-in for one private user.
- Personal profile, goals and availability.
- Twelve-week starting plan.
- Today screen.
- Weekly planner and rescheduling.
- Guided strength workouts and set logging.
- Achilles readiness and post-session check-ins.
- Walk, low-impact cardio and run-walk session player.
- Weight and waist logging.
- Basic calorie, protein and meal logging.
- Dedicated lager and alcohol-unit logging.
- Weekly review and rules-based recommendations.
- Local reminders.
- Data export.

### Deferred until after private MVP

- Apple Health and Apple Watch integration.
- Barcode scanning.
- Voice food logging.
- Photo-assisted meal estimates.
- AI conversational coach.
- Public registration.
- Subscription payments.
- Android release.
- Coach or physiotherapist portal.
- Social feed, leaderboards and public challenges.

## 1.7 Functional requirements

### Account and profile

**FR-001** The user can sign in securely with email and password or magic link.  
**FR-002** The user can record height, weight, waist, date of birth, goals, time zone and preferred units.  
**FR-003** The user can record training availability, session-duration preferences and available equipment.  
**FR-004** The user can record relevant restrictions and the previous Achilles injury as self-reported context.  
**FR-005** The user can edit their profile and export or delete their data.

### Today and planning

**FR-010** The home screen displays today's planned session, duration, equipment and status.  
**FR-011** The home screen displays daily calories, protein, steps when available, and alcohol-free-day status.  
**FR-012** The user can start, complete, skip or reschedule a session.  
**FR-013** Rescheduling must apply spacing rules and show conflicts before saving.  
**FR-014** The app records whether a missed session was skipped, replaced, rescheduled or prevented by pain or illness.

### Strength training

**FR-020** The user can complete Strength A and Strength B from the initial programme.  
**FR-021** Each exercise displays setup, execution, common mistakes, target repetitions and alternatives.  
**FR-022** The user can log repetitions, weight, effort and discomfort for every set.  
**FR-023** The app suggests progression only when deterministic criteria are satisfied.  
**FR-024** The user can replace an exercise from an approved substitution group.  
**FR-025** The app retains the previous session's values as suggested starting values.  
**FR-026** Rest timers can start automatically or manually.

### Achilles and readiness

**FR-030** A readiness check is required before running and lower-body sessions.  
**FR-031** The check records pain, morning stiffness, swelling, walking pattern, sudden change and confidence.  
**FR-032** The rules engine returns green, amber or red.  
**FR-033** Green allows the planned activity, amber proposes a lower-impact alternative, and red prevents the session from being marked safe to begin.  
**FR-034** A post-session and next-morning check can be recorded.  
**FR-035** The app shows urgent language for sudden severe symptoms without claiming a diagnosis.

### Cardio and running

**FR-040** The user can start a timed walk, bike, cross-trainer or run-walk session.  
**FR-041** Run-walk sessions provide warm-up, interval and cool-down timers with audio or haptic cues.  
**FR-042** Running progression requires completed sessions and acceptable symptom responses.  
**FR-043** The user can repeat a week without penalty.  
**FR-044** The app prevents scheduling runs on consecutive days by default.  
**FR-045** The user can substitute low-impact cardio for running.

### Nutrition

**FR-050** The user can log calories and protein manually.  
**FR-051** The user can create foods, meals and reusable meal templates.  
**FR-052** The app displays daily and weekly calorie and protein totals.  
**FR-053** The app uses a rolling weight trend and logging adherence before suggesting calorie changes.  
**FR-054** The user must explicitly accept a calorie-target change.  
**FR-055** Fasting is optional and limited to configurable eating windows. The app does not present fasting as inherently superior.

### Lager and alcohol

**FR-060** The user can log drink name, volume, ABV, calories and occasion.  
**FR-061** The app calculates approximate UK alcohol units using volume and ABV.  
**FR-062** The app displays weekly pints, calories, units and alcohol-free days.  
**FR-063** The user can set a personal weekly limit.  
**FR-064** The app must not recommend starvation, dehydration or punishment exercise after drinking.

### Measurements and progress

**FR-070** The user can record weight several times per week and waist weekly.  
**FR-071** The app displays raw values and a rolling weight trend.  
**FR-072** Progress photographs can be stored privately with explicit consent.  
**FR-073** The dashboard shows adherence, strength, cardio, weight, waist, protein and lager trends.  
**FR-074** Weekly reviews explain the evidence behind each recommendation.

### Notifications and export

**FR-080** The app can send local reminders for sessions, weigh-ins, waist measurements and weekly review.  
**FR-081** Notifications can be disabled individually.  
**FR-082** The user can export their data in a readable machine format.  
**FR-083** The user can delete their account and associated data.

## 1.8 Non-functional requirements

**NFR-001 Security:** All private data is protected by authentication and row-level security.  
**NFR-002 Privacy:** Health and progress data is collected only when needed for a defined feature.  
**NFR-003 Performance:** Today should load its local or cached state within two seconds under normal conditions.  
**NFR-004 Reliability:** A workout in progress must survive temporary loss of connectivity.  
**NFR-005 Accessibility:** Core flows support screen readers, large text and touch targets of at least 44 by 44 points.  
**NFR-006 Language:** User-facing text uses British English.  
**NFR-007 Auditability:** Plan changes record the reason, previous value and new value.  
**NFR-008 Explainability:** Safety and progression decisions display which inputs triggered them.  
**NFR-009 Maintainability:** Domain rules are isolated from interface code and covered by tests.  
**NFR-010 Portability:** Data is not locked into a proprietary opaque format.

## 1.9 Release acceptance criteria

The private MVP may be used for real training only when:

- All red and amber Achilles scenarios pass automated tests.
- A lower-body or running session cannot bypass a required readiness check.
- Workout logs survive app backgrounding and temporary network loss.
- Calorie adjustments require sufficient data and user acceptance.
- Every user-owned table has active row-level security.
- Account export and deletion are tested.
- No AI-generated decision controls training progression.
- The initial twelve-week plan has been reviewed for internal consistency.
- The app has been tested on a physical iPhone.
