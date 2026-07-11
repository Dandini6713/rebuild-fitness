import { describe, expect, it } from '@jest/globals';

import type { OnboardingDraft } from '@/features/onboarding/onboardingDraft';
import {
  firstIncompleteStep,
  nextStepId,
  previousStepId,
  resolveResumeStep,
  stepNumber,
  stepProgress,
} from '@/features/onboarding/onboardingSteps';

const goals = {
  currentWeightKg: 90,
  heightCm: 183,
  mainObjective: 'lose_fat' as const,
  preferredRate: 'steady' as const,
  targetWeightKg: 84,
  waistCm: 96,
};

const availability = {
  gymAccess: 'gym' as const,
  homeEquipment: ['dumbbells_10kg' as const],
  preferredCardio: ['walking' as const],
  sessionDurationMinutes: 45 as const,
  trainingDays: ['monday' as const],
};

describe('onboarding step order', () => {
  it('numbers and measures progress across five steps', () => {
    expect(stepNumber('welcome')).toBe(1);
    expect(stepNumber('confirm')).toBe(5);
    expect(stepProgress('welcome')).toBe(20);
    expect(stepProgress('confirm')).toBe(100);
  });

  it('walks forwards and backwards, stopping at the ends', () => {
    expect(nextStepId('welcome')).toBe('goals');
    expect(nextStepId('confirm')).toBeNull();
    expect(previousStepId('welcome')).toBeNull();
    expect(previousStepId('goals')).toBe('welcome');
  });
});

describe('firstIncompleteStep', () => {
  it('finds the earliest step still missing data', () => {
    const base: OnboardingDraft = { currentStepId: 'welcome', version: 1 };
    expect(firstIncompleteStep(base)).toBe('goals');
    expect(firstIncompleteStep({ ...base, goals })).toBe('availability');
    expect(firstIncompleteStep({ ...base, availability, goals })).toBe(
      'achilles',
    );
  });
});

describe('resolveResumeStep', () => {
  it('returns to the stored step when data allows it', () => {
    const draft: OnboardingDraft = {
      currentStepId: 'availability',
      goals,
      version: 1,
    };
    expect(resolveResumeStep(draft)).toBe('availability');
  });

  it('never resumes past the first step still missing data', () => {
    // Stored pointer claims 'confirm' but availability/achilles are absent.
    const draft: OnboardingDraft = {
      currentStepId: 'confirm',
      goals,
      version: 1,
    };
    expect(resolveResumeStep(draft)).toBe('availability');
  });

  it('respects a user who stepped back to welcome', () => {
    const draft: OnboardingDraft = {
      currentStepId: 'welcome',
      goals,
      version: 1,
    };
    expect(resolveResumeStep(draft)).toBe('welcome');
  });
});
