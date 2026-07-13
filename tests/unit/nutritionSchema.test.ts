import { describe, expect, it } from '@jest/globals';

import {
  validateFood,
  validateMealTemplate,
  validateQuickEntry,
  validateTarget,
} from '@/features/nutrition/nutritionSchema';

describe('validateFood', () => {
  it('accepts a complete food and trims/normalises optional fields', () => {
    const result = validateFood({
      calories: 180,
      carbohydrateG: 30.5,
      fatG: 3,
      favourite: true,
      name: '  Porridge ',
      proteinG: 6,
      servingDescription: '  1 bowl ',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      calories: 180,
      carbohydrateG: 30.5,
      fatG: 3,
      favourite: true,
      name: 'Porridge',
      proteinG: 6,
      servingDescription: '1 bowl',
    });
  });

  it('defaults optional macros to null and favourite to false', () => {
    const result = validateFood({
      calories: 90,
      name: 'Banana',
      proteinG: 1,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.carbohydrateG).toBeNull();
    expect(result.data.fatG).toBeNull();
    expect(result.data.favourite).toBe(false);
    expect(result.data.servingDescription).toBeNull();
  });

  it('rejects a missing name and non-integer calories', () => {
    const result = validateFood({
      calories: 180.5,
      name: '   ',
      proteinG: 6,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.name).toBeDefined();
    expect(result.errors.calories).toBeDefined();
  });

  it('rejects protein with more than two decimal places', () => {
    const result = validateFood({
      calories: 100,
      name: 'X',
      proteinG: 6.123,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.proteinG).toContain('two decimal places');
  });
});

describe('validateQuickEntry', () => {
  const now = new Date('2026-07-13T12:00:00.000Z');

  it('accepts a valid quick entry', () => {
    const result = validateQuickEntry(
      {
        calories: 250,
        description: 'Flat white',
        loggedAt: new Date('2026-07-13T09:00:00.000Z'),
        mealType: 'breakfast',
        proteinG: 8,
      },
      now,
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.mealType).toBe('breakfast');
    expect(result.data.loggedAtIso).toBe('2026-07-13T09:00:00.000Z');
  });

  it('rejects an unrecognised meal and a future time', () => {
    const result = validateQuickEntry(
      {
        calories: 250,
        description: 'Snack',
        loggedAt: new Date('2026-07-14T09:00:00.000Z'),
        mealType: 'brunch',
        proteinG: 8,
      },
      now,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.mealType).toBeDefined();
    expect(result.errors.loggedAt).toBeDefined();
  });

  it('requires calories and protein', () => {
    const result = validateQuickEntry(
      {
        calories: null,
        description: 'Snack',
        loggedAt: now,
        mealType: 'lunch',
        proteinG: null,
      },
      now,
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.calories).toBeDefined();
    expect(result.errors.proteinG).toBeDefined();
  });
});

describe('validateTarget', () => {
  it('accepts an in-range target and formats a plain date', () => {
    const result = validateTarget({
      calories: 2100,
      effectiveFrom: new Date(2026, 6, 13, 9, 0, 0), // 13 Jul 2026, local
      proteinG: 140,
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data).toEqual({
      calories: 2100,
      effectiveFromIso: '2026-07-13',
      proteinG: 140,
    });
  });

  it('rejects calories below the safety-aligned floor and above the ceiling', () => {
    expect(
      validateTarget({
        calories: 800,
        effectiveFrom: new Date(),
        proteinG: 140,
      }).success,
    ).toBe(false);
    expect(
      validateTarget({
        calories: 7000,
        effectiveFrom: new Date(),
        proteinG: 140,
      }).success,
    ).toBe(false);
  });

  it('rejects protein above the configured maximum', () => {
    const result = validateTarget({
      calories: 2100,
      effectiveFrom: new Date(),
      proteinG: 500,
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.proteinG).toBeDefined();
  });
});

describe('validateMealTemplate', () => {
  const item = (description: string) => ({
    calories: 180,
    description,
    proteinG: 6,
    servingQuantity: 1,
  });

  it('accepts a named meal with at least one item', () => {
    const result = validateMealTemplate({
      items: [item('Porridge'), item('Banana')],
      name: 'Usual breakfast',
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.data.items).toHaveLength(2);
    expect(result.data.items[0]!.foodId).toBeNull();
  });

  it('rejects a meal with no items', () => {
    const result = validateMealTemplate({ items: [], name: 'Empty' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.items).toBeDefined();
  });

  it('rejects a meal with no name', () => {
    const result = validateMealTemplate({ items: [item('X')], name: '  ' });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.errors.name).toBeDefined();
  });
});
