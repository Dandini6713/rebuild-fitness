import { describe, expect, it } from '@jest/globals';

import {
  validateAchilles,
  validateAvailability,
  validateGoals,
} from '@/features/onboarding/onboardingSchema';

describe('validateGoals', () => {
  const valid = {
    currentWeightKg: '90',
    heightCm: '183',
    mainObjective: 'lose_fat' as const,
    preferredRate: 'steady' as const,
    targetWeightKg: '84',
    waistCm: '96',
  };

  it('parses valid measurements into typed numbers', () => {
    const result = validateGoals(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.heightCm).toBe(183);
      expect(result.data.targetWeightKg).toBe(84);
      expect(result.data.mainObjective).toBe('lose_fat');
    }
  });

  it('rejects non-numeric measurements', () => {
    const result = validateGoals({ ...valid, heightCm: 'tall' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.heightCm).toBeDefined();
    }
  });

  it('rejects out-of-range measurements', () => {
    const result = validateGoals({ ...valid, heightCm: '10' });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.heightCm).toContain('between 100 and 250');
    }
  });

  it('requires an objective and a pace to be chosen', () => {
    const result = validateGoals({
      ...valid,
      mainObjective: '',
      preferredRate: '',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.mainObjective).toBeDefined();
      expect(result.fieldErrors.preferredRate).toBeDefined();
    }
  });
});

describe('validateAvailability', () => {
  const valid = {
    gymAccess: 'gym' as const,
    homeEquipment: ['dumbbells_10kg' as const],
    preferredCardio: ['walking' as const],
    sessionDurationMinutes: '45' as const,
    trainingDays: ['monday' as const, 'wednesday' as const],
  };

  it('coerces the session duration to a number', () => {
    const result = validateAvailability(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.sessionDurationMinutes).toBe(45);
    }
  });

  it('requires at least one training day', () => {
    const result = validateAvailability({ ...valid, trainingDays: [] });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.trainingDays).toBeDefined();
    }
  });
});

describe('validateAchilles', () => {
  const valid = {
    calfRaiseCapability: 'comfortable' as const,
    painStiffness: 'none' as const,
    previousInjuryAcknowledged: true,
    professionalRestrictions: '  see physio  ',
    walkingTolerance: 'unrestricted' as const,
  };

  it('trims the optional professional restrictions', () => {
    const result = validateAchilles(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.professionalRestrictions).toBe('see physio');
    }
  });

  it('requires the background-context acknowledgement', () => {
    const result = validateAchilles({
      ...valid,
      previousInjuryAcknowledged: false,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.previousInjuryAcknowledged).toBeDefined();
    }
  });

  it('accepts empty restrictions', () => {
    const result = validateAchilles({
      ...valid,
      professionalRestrictions: '',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.professionalRestrictions).toBe('');
    }
  });
});
