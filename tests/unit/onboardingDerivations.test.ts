import { describe, expect, it } from '@jest/globals';

import {
  deriveAchillesCaution,
  deriveWeightPlan,
} from '@/features/onboarding/onboardingDerivations';
import type {
  AchillesData,
  GoalsData,
} from '@/features/onboarding/onboardingModel';

const goals: GoalsData = {
  currentWeightKg: 90,
  heightCm: 183,
  mainObjective: 'lose_fat',
  preferredRate: 'steady',
  targetWeightKg: 84,
  waistCm: 96,
};

describe('deriveWeightPlan', () => {
  it('estimates weeks for a loss at the chosen pace', () => {
    const plan = deriveWeightPlan(goals);
    expect(plan.direction).toBe('loss');
    expect(plan.deltaKg).toBe(-6);
    // 6 kg at ~0.5 kg/week → 12 weeks.
    expect(plan.estimatedWeeks).toBe(12);
    expect(plan.summary).toContain('estimate, not a promise');
  });

  it('recognises a maintain goal and gives no timeline', () => {
    const plan = deriveWeightPlan({ ...goals, targetWeightKg: 90 });
    expect(plan.direction).toBe('maintain');
    expect(plan.estimatedWeeks).toBeNull();
  });

  it('handles a gain goal', () => {
    const plan = deriveWeightPlan({
      ...goals,
      mainObjective: 'build_strength',
      preferredRate: 'gentle',
      targetWeightKg: 92,
    });
    expect(plan.direction).toBe('gain');
    // 2 kg at ~0.25 kg/week → 8 weeks.
    expect(plan.estimatedWeeks).toBe(8);
  });
});

describe('deriveAchillesCaution', () => {
  const calm: AchillesData = {
    calfRaiseCapability: 'comfortable',
    painStiffness: 'none',
    previousInjuryAcknowledged: true,
    professionalRestrictions: '',
    walkingTolerance: 'unrestricted',
  };

  it('does not flag a cautious start when everything is settled', () => {
    expect(deriveAchillesCaution(calm).conservativeStart).toBe(false);
  });

  it('flags a cautious start and explains why', () => {
    const result = deriveAchillesCaution({
      ...calm,
      calfRaiseCapability: 'unable',
      painStiffness: 'significant',
    });
    expect(result.conservativeStart).toBe(true);
    expect(result.reasons.length).toBeGreaterThanOrEqual(2);
  });
});
