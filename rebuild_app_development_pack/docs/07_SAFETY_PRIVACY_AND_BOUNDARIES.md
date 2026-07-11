# 7. Safety, Privacy and Product Boundaries

## 7.1 Product boundary

Rebuild is a general fitness and wellness application. It helps a user follow a fitness plan, record self-reported symptoms and choose conservative activity alternatives. It does not diagnose, treat, rehabilitate, prevent or monitor a medical condition on behalf of a clinician.

User-facing copy must not claim that:

- An Achilles tendon is healed.
- A symptom represents a re-rupture or another diagnosis.
- A user is medically fit to run.
- The app replaces a GP, physiotherapist or emergency service.
- A calorie or fasting plan is medically appropriate for every person.

## 7.2 Safety escalation copy

For a red Achilles result, use language similar to:

> Do not start this session. You reported a sudden or significant change. The app cannot determine the cause. Seek prompt advice from an appropriate healthcare professional. Use urgent services if the injury is severe, you cannot bear weight, or you are otherwise concerned.

The final wording should be reviewed before public release.

## 7.3 Calorie and nutrition safeguards

- Do not encourage rapid weight loss.
- Do not automatically reduce calories.
- Do not use shame or moral labels for food.
- Do not recommend fasting as punishment.
- Flag incomplete logging before interpreting a plateau.
- Allow the user to disable calorie targets and use meal structure only.
- Do not provide medication advice.
- Where the user has relevant health concerns, advise professional review rather than adapting medically.

## 7.4 Alcohol safeguards

- Display estimated calories and units with an approximation label.
- Do not encourage “earning” drinks through exercise.
- Do not recommend driving or safety-critical activity after drinking.
- Do not frame a single occasion as failure.
- Provide a configurable personal limit and alcohol-free-day tracking.

## 7.5 AI safety boundary

The AI coach may:

- Explain a rules-engine result.
- Summarise recorded progress.
- Suggest approved exercise alternatives.
- Reorganise a plan within scheduling constraints.
- Suggest meals from user-defined calorie and protein parameters.
- Clarify how to use the app.

The AI coach may not:

- Diagnose symptoms.
- Override red or amber classifications.
- invent a new rehabilitation protocol.
- Directly edit targets or plans without a validated tool and user confirmation.
- Generate extreme calorie targets.
- Interpret blood tests or medication interactions.
- Give emergency reassurance.

## 7.6 Privacy classification

The app stores information that may include health context, weight, waist, exercise, alcohol and progress photographs. Treat all of it as highly private, even in a one-user beta.

## 7.7 Privacy requirements

- Collect the minimum information needed.
- Explain each permission at the point of use.
- Make progress photographs optional.
- Use private storage buckets and signed access.
- Do not sell or use health data for advertising.
- Do not include sensitive data in analytics events.
- Provide export and deletion.
- Document retention.
- Obtain explicit consent before future Apple Health access.
- Record acceptance of material privacy and wellness notices.

## 7.8 Authentication and session security

- Use secure platform storage for authentication tokens.
- Support session revocation.
- Require recent authentication before account deletion or sensitive export.
- Avoid exposing whether an email address exists.
- Rate-limit sign-in and export actions.

## 7.9 Progress photographs

- Store in a private bucket.
- Generate no public URLs.
- Use short-lived signed URLs.
- Remove storage objects when database records are deleted.
- Do not analyse images in the MVP.
- Do not upload photographs to an AI provider without a separate explicit consent flow.

## 7.10 Public-release prerequisites

Before allowing public registration:

- Obtain UK privacy and product-boundary review.
- Review whether any feature could be considered a medical-device function.
- Complete threat modelling and penetration testing proportionate to the service.
- Produce a privacy notice and terms.
- Add incident and breach procedures.
- Review AI provider data handling.
- Complete accessibility testing.
- Validate the exercise and symptom rules with appropriately qualified professionals.
