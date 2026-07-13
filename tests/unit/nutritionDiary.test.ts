import { describe, expect, it } from '@jest/globals';

import {
  countNutritionDaysInWindow,
  dayWindow,
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

describe('dayWindow', () => {
  it('frames a raw UTC day when the offset is zero (unchanged behaviour)', () => {
    expect(dayWindow('2026-07-13', 0)).toEqual({
      endIso: '2026-07-13T23:59:59.999Z',
      startIso: '2026-07-13T00:00:00.000Z',
    });
  });

  it('shifts the window to the local calendar day in BST (UTC+1)', () => {
    // getTimezoneOffset() is -60 in BST. Local midnight 2026-07-13 is 2026-07-12T23:00Z,
    // and the last local millisecond is 2026-07-13T22:59:59.999Z.
    expect(dayWindow('2026-07-13', -60)).toEqual({
      endIso: '2026-07-13T22:59:59.999Z',
      startIso: '2026-07-12T23:00:00.000Z',
    });
  });

  it('includes a 00:30 local log in that local day, not the previous one', () => {
    // 00:30 local on 2026-07-13 in UTC+1 is 2026-07-12T23:30:00Z — the one-hour gap the
    // old raw-UTC window silently dropped.
    const loggedAt = '2026-07-12T23:30:00.000Z';
    const today = dayWindow('2026-07-13', -60);
    const yesterday = dayWindow('2026-07-12', -60);
    expect(loggedAt >= today.startIso && loggedAt <= today.endIso).toBe(true);
    expect(loggedAt >= yesterday.startIso && loggedAt <= yesterday.endIso).toBe(
      false,
    );
  });

  it('includes a 23:30 local log in that day and excludes it from the next', () => {
    // 23:30 local on 2026-07-13 in UTC+1 is 2026-07-13T22:30:00Z.
    const loggedAt = '2026-07-13T22:30:00.000Z';
    const today = dayWindow('2026-07-13', -60);
    const tomorrow = dayWindow('2026-07-14', -60);
    expect(loggedAt >= today.startIso && loggedAt <= today.endIso).toBe(true);
    expect(loggedAt >= tomorrow.startIso && loggedAt <= tomorrow.endIso).toBe(
      false,
    );
  });

  it('assigns a log at exactly local midnight to the new day', () => {
    // Local midnight 2026-07-13 in UTC+1 is the inclusive start of that day's window.
    const localMidnight = '2026-07-12T23:00:00.000Z';
    const today = dayWindow('2026-07-13', -60);
    const yesterday = dayWindow('2026-07-12', -60);
    expect(today.startIso).toBe(localMidnight);
    expect(
      localMidnight >= today.startIso && localMidnight <= today.endIso,
    ).toBe(true);
    expect(
      localMidnight >= yesterday.startIso && localMidnight <= yesterday.endIso,
    ).toBe(false);
  });

  it('adjacent local days abut with no gap and no overlap', () => {
    // The end of one day is one millisecond before the start of the next: nothing falls
    // between them (the property that eliminates the silent-loss gap).
    const day = dayWindow('2026-07-13', -60);
    const next = dayWindow('2026-07-14', -60);
    expect(new Date(next.startIso).getTime()).toBe(
      new Date(day.endIso).getTime() + 1,
    );
  });

  it('handles a west-of-UTC offset (EST, UTC-5)', () => {
    // getTimezoneOffset() is +300 in EST. Local midnight 2026-07-13 is 2026-07-13T05:00Z.
    expect(dayWindow('2026-07-13', 300)).toEqual({
      endIso: '2026-07-14T04:59:59.999Z',
      startIso: '2026-07-13T05:00:00.000Z',
    });
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

describe('countNutritionDaysInWindow (docs/06 §6.7 — the load-bearing LOCAL-day count)', () => {
  // A helper: one log at a given ISO instant.
  const log = (loggedAtIso: string) => ({ loggedAtIso });

  it('counts DISTINCT local days, not log rows (three logs on one day = one day)', () => {
    // BST (UTC+1) → offsetMinutes -60. Three logs all on the local day 2026-07-10.
    const logs = [
      log('2026-07-10T08:00:00.000Z'),
      log('2026-07-10T13:00:00.000Z'),
      log('2026-07-10T20:00:00.000Z'),
    ];
    expect(
      countNutritionDaysInWindow(logs, '2026-07-07', '2026-07-13', -60),
    ).toBe(1);
  });

  it('a 00:30-local log counts for its LOCAL day, not a raw UTC day', () => {
    // BST (UTC+1): 2026-07-10T23:30:00Z is 2026-07-11 00:30 local — it belongs to July 11.
    const logs = [log('2026-07-10T23:30:00.000Z')];
    // Windowed on July 11 only: counted.
    expect(
      countNutritionDaysInWindow(logs, '2026-07-11', '2026-07-11', -60),
    ).toBe(1);
    // Windowed on July 10 only: NOT counted (it is the next local day).
    expect(
      countNutritionDaysInWindow(logs, '2026-07-10', '2026-07-10', -60),
    ).toBe(0);
  });

  it('the 9-vs-10 boundary flips eligibility', () => {
    // 14-day window ending 2026-07-13. Nine distinct local days logged, then ten.
    const nineDays = [];
    for (let i = 0; i < 9; i += 1) {
      const day = new Date(Date.UTC(2026, 6, 13) - i * 86_400_000);
      nineDays.push(
        log(new Date(day.getTime() + 12 * 3_600_000).toISOString()),
      );
    }
    expect(
      countNutritionDaysInWindow(nineDays, '2026-06-30', '2026-07-13', 0),
    ).toBe(9);

    const tenDays = [...nineDays];
    const tenth = new Date(Date.UTC(2026, 6, 13) - 9 * 86_400_000);
    tenDays.push(log(new Date(tenth.getTime() + 12 * 3_600_000).toISOString()));
    expect(
      countNutritionDaysInWindow(tenDays, '2026-06-30', '2026-07-13', 0),
    ).toBe(10);
  });

  it('ignores logs outside the window and handles an empty window', () => {
    const logs = [
      log('2026-07-01T12:00:00.000Z'),
      log('2026-07-20T12:00:00.000Z'),
    ];
    expect(
      countNutritionDaysInWindow(logs, '2026-07-07', '2026-07-13', 0),
    ).toBe(0);
    expect(countNutritionDaysInWindow([], '2026-07-07', '2026-07-13', 0)).toBe(
      0,
    );
  });
});
