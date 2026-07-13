import { describe, expect, it } from '@jest/globals';

import {
  type DiaryEntry,
  isMealType,
  type MealType,
  scaleMacros,
  summariseDiary,
} from '@/domain/nutrition/nutritionDiary';

const entry = (
  id: string,
  mealType: MealType,
  calories: number,
  proteinG: number,
): DiaryEntry => ({ calories, description: id, id, mealType, proteinG });

describe('scaleMacros', () => {
  it('scales calories to a whole number and grams to two decimals', () => {
    expect(
      scaleMacros(
        { calories: 133, carbohydrateG: 20.5, fatG: 3.3, proteinG: 10.4 },
        1.5,
      ),
    ).toEqual({
      calories: 200, // round(133 * 1.5 = 199.5)
      carbohydrateG: 30.75,
      fatG: 4.95,
      proteinG: 15.6,
    });
  });

  it('keeps a null carbohydrate/fat null rather than fabricating a zero', () => {
    expect(scaleMacros({ calories: 100, proteinG: 8 }, 2)).toEqual({
      calories: 200,
      carbohydrateG: null,
      fatG: null,
      proteinG: 16,
    });
  });

  it('is exact for a whole-serving log (quantity 1)', () => {
    const macros = {
      calories: 250,
      carbohydrateG: 30,
      fatG: 9,
      proteinG: 12.5,
    };
    expect(scaleMacros(macros, 1)).toEqual({
      calories: 250,
      carbohydrateG: 30,
      fatG: 9,
      proteinG: 12.5,
    });
  });
});

describe('summariseDiary', () => {
  it('returns no meals and zero totals for an empty day', () => {
    expect(summariseDiary([])).toEqual({
      meals: [],
      totals: { calories: 0, proteinG: 0 },
    });
  });

  it('groups entries by meal in canonical order and totals each', () => {
    const summary = summariseDiary([
      entry('a', 'dinner', 700, 40),
      entry('b', 'breakfast', 400, 25),
      entry('c', 'breakfast', 150, 10),
      entry('d', 'snacks', 200, 5),
    ]);
    expect(summary.meals.map((m) => m.mealType)).toEqual([
      'breakfast',
      'dinner',
      'snacks',
    ]);
    const breakfast = summary.meals[0]!;
    expect(breakfast.calories).toBe(550);
    expect(breakfast.proteinG).toBe(35);
    expect(breakfast.entries.map((e) => e.id)).toEqual(['b', 'c']);
    expect(summary.totals).toEqual({ calories: 1450, proteinG: 80 });
  });

  it('sums calorie integers exactly (no floating-point drift)', () => {
    // Many small integer calories must sum to an exact integer.
    const entries = Array.from({ length: 30 }, (_, i) =>
      entry(`e${i}`, 'snacks', 37, 0),
    );
    expect(summariseDiary(entries).totals.calories).toBe(1110);
  });

  it('rounds accumulated decimal protein to two places', () => {
    // 0.1 + 0.2 style accumulation must not leak binary drift into the total.
    const summary = summariseDiary([
      entry('a', 'lunch', 100, 0.1),
      entry('b', 'lunch', 100, 0.2),
    ]);
    expect(summary.totals.proteinG).toBe(0.3);
    expect(summary.meals[0]!.proteinG).toBe(0.3);
  });

  it('totals a meal template expanded into several entries', () => {
    // A saved meal logged at once expands into one entry per item; the diary totals
    // them like any other entries.
    const expanded = [
      entry('t1', 'breakfast', 180, 6),
      entry('t2', 'breakfast', 90, 20),
      entry('t3', 'breakfast', 120, 2),
    ];
    const summary = summariseDiary(expanded);
    expect(summary.meals).toHaveLength(1);
    expect(summary.totals).toEqual({ calories: 390, proteinG: 28 });
  });

  it('reflects a scaled serving quantity in the totals', () => {
    // A food logged at 2.5 servings via scaleMacros contributes its scaled calories.
    const scaled = scaleMacros({ calories: 80, proteinG: 4 }, 2.5);
    const summary = summariseDiary([
      { ...entry('s', 'lunch', scaled.calories, scaled.proteinG) },
    ]);
    expect(summary.totals).toEqual({ calories: 200, proteinG: 10 });
  });
});

describe('isMealType', () => {
  it('accepts the four canonical meals and rejects anything else', () => {
    expect(isMealType('breakfast')).toBe(true);
    expect(isMealType('snacks')).toBe(true);
    expect(isMealType('brunch')).toBe(false);
    expect(isMealType('')).toBe(false);
  });
});
