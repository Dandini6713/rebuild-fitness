// Step order and progress helpers for the onboarding flow. Pure and testable;
// the flow component reads resume/next/previous decisions from here rather than
// hard-coding navigation.

import type { OnboardingDraft } from './onboardingDraft';

export const ONBOARDING_STEPS = [
  { id: 'welcome', screen: 'S-001', title: 'Welcome' },
  { id: 'goals', screen: 'S-002', title: 'Goals and measurements' },
  { id: 'availability', screen: 'S-003', title: 'Availability and equipment' },
  { id: 'achilles', screen: 'S-004', title: 'Achilles and current capability' },
  { id: 'confirm', screen: 'S-005', title: 'Plan confirmation' },
] as const;

export type OnboardingStepId = (typeof ONBOARDING_STEPS)[number]['id'];

const STEP_IDS: OnboardingStepId[] = ONBOARDING_STEPS.map((step) => step.id);

export function isOnboardingStepId(value: unknown): value is OnboardingStepId {
  return (
    typeof value === 'string' && STEP_IDS.includes(value as OnboardingStepId)
  );
}

export function stepIndex(id: OnboardingStepId): number {
  return STEP_IDS.indexOf(id);
}

export function stepNumber(id: OnboardingStepId): number {
  return stepIndex(id) + 1;
}

export const stepCount = ONBOARDING_STEPS.length;

// Fraction (0–100) for the ProgressBar: step N of total.
export function stepProgress(id: OnboardingStepId): number {
  return Math.round((stepNumber(id) / stepCount) * 100);
}

export function nextStepId(id: OnboardingStepId): OnboardingStepId | null {
  return STEP_IDS[stepIndex(id) + 1] ?? null;
}

export function previousStepId(id: OnboardingStepId): OnboardingStepId | null {
  const index = stepIndex(id);
  return index > 0 ? (STEP_IDS[index - 1] ?? null) : null;
}

// The first step whose data has not yet been captured. Welcome carries no data,
// so completeness is judged from the three data steps onwards.
export function firstIncompleteStep(draft: OnboardingDraft): OnboardingStepId {
  if (!draft.goals) {
    return 'goals';
  }
  if (!draft.availability) {
    return 'availability';
  }
  if (!draft.achilles) {
    return 'achilles';
  }
  return 'confirm';
}

// Where to drop the user back into an interrupted onboarding. We respect the
// step they were last on, but never past the first step still missing data, so
// a corrupt stored pointer can't skip a required form.
export function resolveResumeStep(draft: OnboardingDraft): OnboardingStepId {
  const storedIndex = isOnboardingStepId(draft.currentStepId)
    ? stepIndex(draft.currentStepId)
    : 0;
  const incompleteIndex = stepIndex(firstIncompleteStep(draft));
  return STEP_IDS[Math.min(storedIndex, incompleteIndex)] ?? 'welcome';
}
