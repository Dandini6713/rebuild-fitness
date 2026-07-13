import { describe, expect, it } from '@jest/globals';

import {
  validateDrinkFavourite,
  validateDrinkLog,
  validateWeeklyLimit,
} from '@/features/alcohol/alcoholSchema';

const NOW = new Date('2026-07-13T12:00:00.000Z');

describe('validateDrinkLog', () => {
  const validDraft = {
    abvPercent: 5,
    calories: 215,
    drinkName: 'Lager',
    drinkType: 'Beer',
    loggedAt: new Date('2026-07-13T11:00:00.000Z'),
    occasionNote: 'With dinner',
    volumeMl: 568,
  };

  it('accepts a valid drink and derives units from volume and ABV', () => {
    const result = validateDrinkLog(validDraft, NOW);
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.units).toBe(2.84); // 568 × 5 / 1000
    expect(result.data.drinkName).toBe('Lager');
    expect(result.data.drinkType).toBe('Beer');
    expect(result.data.occasionNote).toBe('With dinner');
    expect(result.data.loggedAtIso).toBe('2026-07-13T11:00:00.000Z');
  });

  it('trims an empty optional type and note to null', () => {
    const result = validateDrinkLog(
      { ...validDraft, drinkType: '   ', occasionNote: '' },
      NOW,
    );
    if (!result.success) throw new Error('expected success');
    expect(result.data.drinkType).toBeNull();
    expect(result.data.occasionNote).toBeNull();
  });

  it('rejects a missing name', () => {
    const result = validateDrinkLog({ ...validDraft, drinkName: '  ' }, NOW);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.drinkName).toBeDefined();
  });

  it('rejects a non-positive volume', () => {
    const result = validateDrinkLog({ ...validDraft, volumeMl: 0 }, NOW);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.volumeMl).toBeDefined();
  });

  it('rejects an ABV above 100 and below 0', () => {
    expect(
      validateDrinkLog({ ...validDraft, abvPercent: 101 }, NOW).success,
    ).toBe(false);
    expect(
      validateDrinkLog({ ...validDraft, abvPercent: -1 }, NOW).success,
    ).toBe(false);
  });

  it('rejects non-integer or negative calories', () => {
    expect(
      validateDrinkLog({ ...validDraft, calories: 12.5 }, NOW).success,
    ).toBe(false);
    expect(validateDrinkLog({ ...validDraft, calories: -5 }, NOW).success).toBe(
      false,
    );
  });

  it('rejects a null numeric field (nothing typed)', () => {
    const result = validateDrinkLog(
      { ...validDraft, volumeMl: null, abvPercent: null, calories: null },
      NOW,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.volumeMl).toBeDefined();
    expect(result.errors.abvPercent).toBeDefined();
    expect(result.errors.calories).toBeDefined();
  });

  it('rejects more than two decimal places on volume or ABV', () => {
    expect(
      validateDrinkLog({ ...validDraft, volumeMl: 568.123 }, NOW).success,
    ).toBe(false);
    expect(
      validateDrinkLog({ ...validDraft, abvPercent: 5.123 }, NOW).success,
    ).toBe(false);
  });

  it('rejects a future logged time', () => {
    const result = validateDrinkLog(
      { ...validDraft, loggedAt: new Date('2026-07-13T13:00:00.000Z') },
      NOW,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.loggedAt).toBeDefined();
  });
});

describe('validateDrinkFavourite', () => {
  it('accepts a valid favourite (no time, no note)', () => {
    const result = validateDrinkFavourite({
      abvPercent: 40,
      calories: 61,
      drinkName: 'Single spirit',
      drinkType: 'Spirit',
      volumeMl: 25,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.drinkName).toBe('Single spirit');
    expect(result.data.volumeMl).toBe(25);
  });

  it('rejects malformed numbers', () => {
    expect(
      validateDrinkFavourite({
        abvPercent: 5,
        calories: -1,
        drinkName: 'Bad',
        volumeMl: 500,
      }).success,
    ).toBe(false);
  });
});

describe('validateWeeklyLimit', () => {
  it('accepts a positive number of units', () => {
    const result = validateWeeklyLimit({ units: 14 });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.units).toBe(14);
  });

  it('rejects zero, negative and non-numeric limits', () => {
    expect(validateWeeklyLimit({ units: 0 }).success).toBe(false);
    expect(validateWeeklyLimit({ units: -3 }).success).toBe(false);
    expect(validateWeeklyLimit({ units: null }).success).toBe(false);
  });
});
