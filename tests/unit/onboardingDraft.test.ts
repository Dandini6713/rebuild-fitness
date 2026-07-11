import { describe, expect, it } from '@jest/globals';

import {
  EMPTY_DRAFT,
  isDraftComplete,
  type OnboardingDraft,
  parseDraft,
  serialiseDraft,
} from '@/features/onboarding/onboardingDraft';

const complete: OnboardingDraft = {
  achilles: {
    calfRaiseCapability: 'comfortable',
    painStiffness: 'none',
    previousInjuryAcknowledged: true,
    professionalRestrictions: '',
    walkingTolerance: 'unrestricted',
  },
  availability: {
    gymAccess: 'gym',
    homeEquipment: ['dumbbells_10kg'],
    preferredCardio: ['walking'],
    sessionDurationMinutes: 45,
    trainingDays: ['monday'],
  },
  completedAt: '2026-07-11T00:00:00.000Z',
  currentStepId: 'confirm',
  goals: {
    currentWeightKg: 90,
    heightCm: 183,
    mainObjective: 'lose_fat',
    preferredRate: 'steady',
    targetWeightKg: 84,
    waistCm: 96,
  },
  version: 1,
};

describe('onboarding draft persistence', () => {
  it('round-trips a full draft through serialise/parse', () => {
    expect(parseDraft(serialiseDraft(complete))).toEqual(complete);
  });

  it('falls back to an empty draft for missing or corrupt data', () => {
    expect(parseDraft(null)).toEqual(EMPTY_DRAFT);
    expect(parseDraft('not json')).toEqual(EMPTY_DRAFT);
    expect(parseDraft('{"version":2}')).toEqual(EMPTY_DRAFT);
    // Invalid enum value should be rejected wholesale, not silently kept.
    expect(
      parseDraft(
        JSON.stringify({
          currentStepId: 'goals',
          goals: { ...complete.goals, mainObjective: 'shrink' },
          version: 1,
        }),
      ),
    ).toEqual(EMPTY_DRAFT);
  });

  it('reports completion only when a timestamp is present', () => {
    expect(isDraftComplete(complete)).toBe(true);
    expect(isDraftComplete(EMPTY_DRAFT)).toBe(false);
  });
});
