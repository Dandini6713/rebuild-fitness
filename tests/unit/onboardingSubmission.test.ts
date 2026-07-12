import { describe, expect, it } from '@jest/globals';

import type {
  AchillesData,
  GoalsData,
} from '@/features/onboarding/onboardingModel';
import { buildOnboardingSubmission } from '@/features/onboarding/onboardingSubmission';

const goals: GoalsData = {
  currentWeightKg: 90,
  heightCm: 183,
  mainObjective: 'lose_fat',
  preferredRate: 'steady',
  targetWeightKg: 84,
  waistCm: 96,
};

const achilles: AchillesData = {
  calfRaiseCapability: 'some_difficulty',
  painStiffness: 'mild',
  previousInjuryAcknowledged: true,
  professionalRestrictions: '',
  walkingTolerance: 'unrestricted',
};

const base = {
  achilles,
  completedAt: '2026-07-11T09:00:00.000Z',
  goals,
  userId: 'user-1',
};

describe('buildOnboardingSubmission', () => {
  it('stamps the profile with the completion time and height', () => {
    const { profile } = buildOnboardingSubmission(base);
    expect(profile.user_id).toBe('user-1');
    expect(profile.height_cm).toBe(183);
    expect(profile.onboarding_completed_at).toBe('2026-07-11T09:00:00.000Z');
  });

  it('creates weight and waist goal rows owned by the user', () => {
    const { goals: rows } = buildOnboardingSubmission(base);
    const weight = rows.find((row) => row.goal_type === 'lose_fat');
    const waist = rows.find((row) => row.goal_type === 'waist');
    expect(weight).toMatchObject({
      start_value: 90,
      target_value: 84,
      user_id: 'user-1',
    });
    expect(waist).toMatchObject({ start_value: 96, user_id: 'user-1' });
  });

  it('records self-reported Achilles context with null restrictions when blank', () => {
    const { healthContext } = buildOnboardingSubmission(base);
    expect(healthContext).toHaveLength(1);
    const [context] = healthContext;
    expect(context?.context_type).toBe('achilles_history');
    expect(context?.professional_restrictions).toBeNull();
    // Must be factual, never a diagnosis or a claim about healing.
    expect(context?.description).not.toMatch(/healed|re-rupture|diagnos/i);
  });

  it('keeps professional restrictions when supplied', () => {
    const { healthContext } = buildOnboardingSubmission({
      ...base,
      achilles: { ...achilles, professionalRestrictions: 'physio advised' },
    });
    expect(healthContext[0]?.professional_restrictions).toBe('physio advised');
  });
});
