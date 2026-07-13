import { describe, expect, it } from '@jest/globals';

import {
  computeUnits,
  type DrinkRecord,
  summariseAlcoholWeek,
  weekDays,
  weekWindow,
} from '@/domain/alcohol/alcoholUnits';

describe('computeUnits — common pint sizes and strengths (docs/06 §6.9, docs/10)', () => {
  // The prompt calls these out explicitly: units = volume_ml × abv_percent / 1000.
  it('imperial pint (568 ml) across common strengths', () => {
    expect(computeUnits(568, 3.4)).toBe(1.93); // 1.9312 → 1.93
    expect(computeUnits(568, 4)).toBe(2.27); // 2.272 → 2.27
    expect(computeUnits(568, 5)).toBe(2.84); // the docs/06 worked example
    expect(computeUnits(568, 5.2)).toBe(2.95); // 2.9536 → 2.95
  });

  it('330 ml and 440 ml cans', () => {
    expect(computeUnits(330, 5)).toBe(1.65);
    expect(computeUnits(440, 5)).toBe(2.2);
    expect(computeUnits(440, 4)).toBe(1.76);
  });

  it('750 ml wine at 12–14%', () => {
    expect(computeUnits(750, 12)).toBe(9);
    expect(computeUnits(750, 13)).toBe(9.75);
    expect(computeUnits(750, 14)).toBe(10.5);
  });

  it('single (25 ml) and double (50 ml) spirit at 40%', () => {
    expect(computeUnits(25, 40)).toBe(1);
    expect(computeUnits(50, 40)).toBe(2);
  });

  it('rounds to two decimal places and handles zero ABV', () => {
    expect(computeUnits(568, 0)).toBe(0);
    // 500 ml at 4.5% = 2.25 exactly.
    expect(computeUnits(500, 4.5)).toBe(2.25);
  });
});

describe('weekDays / weekWindow', () => {
  it('lists the reference day and the six days before it, oldest first', () => {
    expect(weekDays('2026-07-13')).toEqual([
      '2026-07-07',
      '2026-07-08',
      '2026-07-09',
      '2026-07-10',
      '2026-07-11',
      '2026-07-12',
      '2026-07-13',
    ]);
  });

  it('spans local midnight of the earliest day to the last local ms of the reference day (BST)', () => {
    // getTimezoneOffset() is -60 in BST (UTC+1). Local midnight 2026-07-07 is
    // 2026-07-06T23:00Z; the last local ms of 2026-07-13 is 2026-07-13T22:59:59.999Z.
    expect(weekWindow('2026-07-13', -60)).toEqual({
      endIso: '2026-07-13T22:59:59.999Z',
      startIso: '2026-07-06T23:00:00.000Z',
    });
  });

  it('crosses a month boundary correctly', () => {
    expect(weekDays('2026-08-02')).toEqual([
      '2026-07-27',
      '2026-07-28',
      '2026-07-29',
      '2026-07-30',
      '2026-07-31',
      '2026-08-01',
      '2026-08-02',
    ]);
  });
});

describe('summariseAlcoholWeek — totals, free days and % of limit', () => {
  const drink = (
    id: string,
    loggedAtIso: string,
    units: number,
    calories: number,
  ): DrinkRecord => ({ calories, id, loggedAtIso, units });

  // BST (UTC+1) throughout: offset -60. Reference local day is 2026-07-13.
  const drinks: DrinkRecord[] = [
    // Local 2026-07-13 00:30 — the just-after-local-midnight edge the raw-UTC day would
    // have mis-assigned to the 12th. Must count on the 13th.
    drink('a', '2026-07-12T23:30:00.000Z', 2.84, 200),
    // Local 2026-07-13 19:00 — same local day.
    drink('b', '2026-07-13T18:00:00.000Z', 1.65, 140),
    // Local 2026-07-10 13:00 — a different day in the window.
    drink('c', '2026-07-10T12:00:00.000Z', 2, 180),
    // Local 2026-07-06 13:00 — OUTSIDE the seven-day window (earliest day is the 7th).
    drink('out', '2026-07-06T12:00:00.000Z', 3, 300),
  ];

  it('totals only the drinks inside the local seven-day window', () => {
    const summary = summariseAlcoholWeek(drinks, '2026-07-13', -60);
    expect(summary.totalDrinks).toBe(3); // 'out' is excluded
    expect(summary.totalUnits).toBe(6.49); // 2.84 + 1.65 + 2
    expect(summary.totalCalories).toBe(520); // 200 + 140 + 180
    expect(summary.daysInWindow).toBe(7);
  });

  it('counts alcohol-free days as local days with zero drinks', () => {
    // Drinks land on the 13th (two) and the 10th (one): two days have drinks, so five of
    // the seven days are alcohol-free. The 00:30 drink is on the 13th, not the 12th, so
    // the 12th is (correctly) counted as free.
    const summary = summariseAlcoholWeek(drinks, '2026-07-13', -60);
    expect(summary.alcoholFreeDays).toBe(5);
  });

  it('assigns an exactly-local-midnight drink to the new local day', () => {
    // Local midnight 2026-07-13 in BST is 2026-07-12T23:00:00Z — belongs to the 13th.
    const only = [drink('m', '2026-07-12T23:00:00.000Z', 2, 100)];
    const summary = summariseAlcoholWeek(only, '2026-07-13', -60);
    expect(summary.totalDrinks).toBe(1);
    expect(summary.alcoholFreeDays).toBe(6); // only the 13th has a drink
  });

  it('shows percentage of limit only when a positive limit is set', () => {
    const withLimit = summariseAlcoholWeek(drinks, '2026-07-13', -60, 14);
    expect(withLimit.weeklyLimitUnits).toBe(14);
    expect(withLimit.percentOfLimit).toBe(46); // round(6.49 / 14 * 100) = 46

    const noLimit = summariseAlcoholWeek(drinks, '2026-07-13', -60, null);
    expect(noLimit.weeklyLimitUnits).toBeNull();
    expect(noLimit.percentOfLimit).toBeNull();

    // A zero or negative "limit" is treated as unset (no divide-by-zero, no invented %).
    const zeroLimit = summariseAlcoholWeek(drinks, '2026-07-13', -60, 0);
    expect(zeroLimit.percentOfLimit).toBeNull();
    expect(zeroLimit.weeklyLimitUnits).toBeNull();
  });

  it('reports a fully alcohol-free week with an empty, neutral zero total', () => {
    const summary = summariseAlcoholWeek([], '2026-07-13', -60, 14);
    expect(summary).toMatchObject({
      alcoholFreeDays: 7,
      daysInWindow: 7,
      percentOfLimit: 0,
      totalCalories: 0,
      totalDrinks: 0,
      totalUnits: 0,
      weeklyLimitUnits: 14,
    });
  });

  it('is unchanged at a zero UTC offset (raw UTC days)', () => {
    // With offset 0 the window days are raw UTC dates. A 23:30Z drink on the 13th counts
    // on the 13th; a 00:30Z drink on the 13th also counts on the 13th.
    const utcDrinks = [
      drink('late', '2026-07-13T23:30:00.000Z', 2, 100),
      drink('early', '2026-07-13T00:30:00.000Z', 1, 50),
    ];
    const summary = summariseAlcoholWeek(utcDrinks, '2026-07-13', 0);
    expect(summary.totalDrinks).toBe(2);
    expect(summary.alcoholFreeDays).toBe(6);
  });

  it('sums units without binary drift and calories as exact integers', () => {
    const many: DrinkRecord[] = Array.from({ length: 10 }, (_, i) =>
      drink(`d${i}`, '2026-07-13T12:00:00.000Z', 0.1, 37),
    );
    const summary = summariseAlcoholWeek(many, '2026-07-13', 0);
    expect(summary.totalUnits).toBe(1); // 10 × 0.1, rounded to 2dp
    expect(summary.totalCalories).toBe(370);
  });
});
