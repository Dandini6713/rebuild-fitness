import { describe, expect, it } from '@jest/globals';

import {
  evaluateWeightTrend,
  RULE_VERSION,
  type TrendMeasurement,
  type WeightTrendResult,
} from '@/domain/measurements/weightTrend';

// A fixed reference date so every "days ago" is deterministic. The trend reads real
// timestamps, so the tests place readings by age in days relative to this instant.
const REFERENCE = new Date('2026-07-13T08:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// A weight reading `daysAgo` before the reference date. Fractions are allowed so the
// window boundaries (exactly 7 / just over 7) can be exercised precisely.
function weight(daysAgo: number, valueKg: number): TrendMeasurement {
  return {
    measuredAt: new Date(
      REFERENCE.getTime() - daysAgo * MS_PER_DAY,
    ).toISOString(),
    type: 'weight',
    value: valueKg,
  };
}

function waist(daysAgo: number, valueCm: number): TrendMeasurement {
  return {
    measuredAt: new Date(
      REFERENCE.getTime() - daysAgo * MS_PER_DAY,
    ).toISOString(),
    type: 'waist',
    value: valueCm,
  };
}

// A naive per-sample EWMA (fixed α per reading, oldest → newest) — the WRONG
// implementation docs/06 §6.6 warns against. It ignores timestamps entirely, so it
// depends only on the order and count of readings, not on the gaps between them. Used
// to demonstrate that our time-weighted trend behaves differently (and correctly) when
// days are skipped.
function naiveCountEwma(valuesOldestFirst: number[], alpha = 0.3): number {
  let state = valuesOldestFirst[0] ?? 0;
  for (let i = 1; i < valuesOldestFirst.length; i += 1) {
    state = alpha * (valuesOldestFirst[i] as number) + (1 - alpha) * state;
  }
  return state;
}

function expectTrend(
  result: WeightTrendResult,
): Extract<WeightTrendResult, { status: 'trend' }> {
  expect(result.status).toBe('trend');
  if (result.status !== 'trend') {
    throw new Error('expected a trend result');
  }
  return result;
}

describe('evaluateWeightTrend — data sufficiency gate (docs/06 §6.6)', () => {
  it('returns insufficient-data for an empty series, naming both thresholds', () => {
    const result = evaluateWeightTrend([], REFERENCE);
    expect(result.status).toBe('insufficient-data');
    if (result.status !== 'insufficient-data') {
      return;
    }
    expect(result.unmetThresholds).toEqual([
      'three-in-seven',
      'six-in-fourteen',
    ]);
    expect(result.ruleVersion).toBe(RULE_VERSION);
    expect(result.inputs.weightCountConsidered).toBe(0);
  });

  it('returns insufficient-data for a single measurement', () => {
    const result = evaluateWeightTrend([weight(0, 80)], REFERENCE);
    expect(result.status).toBe('insufficient-data');
    if (result.status !== 'insufficient-data') {
      return;
    }
    // One reading fails both the three-in-seven and six-in-fourteen minimums.
    expect(result.unmetThresholds).toEqual([
      'three-in-seven',
      'six-in-fourteen',
    ]);
  });

  it('is sufficient exactly at the 3-in-7 AND 6-in-14 boundaries', () => {
    // Exactly 3 within 7 days and exactly 6 within 14 days.
    const measurements = [
      weight(0, 80),
      weight(3, 80.2),
      weight(7, 80.4), // exactly 7 days => within the short window
      weight(10, 80.6),
      weight(12, 80.8),
      weight(14, 81), // exactly 14 days => within the long window
    ];
    const result = evaluateWeightTrend(measurements, REFERENCE);
    const trend = expectTrend(result);
    expect(trend.inputs.countWithinShortWindow).toBe(3);
    expect(trend.inputs.countWithinLongWindow).toBe(6);
  });

  it('is insufficient just below the 3-in-7 boundary (only two in seven days)', () => {
    // Two within seven days, but plenty within fourteen (6-in-14 satisfied).
    const measurements = [
      weight(0, 80),
      weight(6, 80.2),
      weight(8, 80.4),
      weight(10, 80.6),
      weight(12, 80.8),
      weight(13, 81),
    ];
    const result = evaluateWeightTrend(measurements, REFERENCE);
    expect(result.status).toBe('insufficient-data');
    if (result.status !== 'insufficient-data') {
      return;
    }
    // Only the short-window threshold is unmet; the long-window one is satisfied.
    expect(result.unmetThresholds).toEqual(['three-in-seven']);
    expect(result.inputs.countWithinShortWindow).toBe(2);
    expect(result.inputs.countWithinLongWindow).toBe(6);
  });

  it('is insufficient just below the 6-in-14 boundary (only five in fourteen days)', () => {
    // Three within seven days (short window satisfied) but only five within fourteen.
    const measurements = [
      weight(0, 80),
      weight(2, 80.1),
      weight(5, 80.2),
      weight(9, 80.3),
      weight(13, 80.4),
    ];
    const result = evaluateWeightTrend(measurements, REFERENCE);
    expect(result.status).toBe('insufficient-data');
    if (result.status !== 'insufficient-data') {
      return;
    }
    expect(result.unmetThresholds).toEqual(['six-in-fourteen']);
    expect(result.inputs.countWithinShortWindow).toBe(3);
    expect(result.inputs.countWithinLongWindow).toBe(5);
  });

  it('excludes readings older than fourteen days from the long-window count', () => {
    const measurements = [
      weight(0, 80),
      weight(1, 80),
      weight(2, 80),
      weight(15, 79), // just outside the 14-day window
      weight(20, 79),
      weight(25, 79),
    ];
    const result = evaluateWeightTrend(measurements, REFERENCE);
    expect(result.status).toBe('insufficient-data');
    if (result.status !== 'insufficient-data') {
      return;
    }
    // Three are within seven days, but only three within fourteen — 6-in-14 unmet.
    expect(result.inputs.countWithinLongWindow).toBe(3);
    expect(result.unmetThresholds).toEqual(['six-in-fourteen']);
  });
});

describe('evaluateWeightTrend — the trend value and direction', () => {
  it('reports a robust smoothed level, not the latest noisy reading', () => {
    // A clean daily series drifting down, with one noisy spike on the most recent day.
    const measurements = [
      weight(0, 83), // today's reading is a high-water spike
      weight(1, 80.4),
      weight(2, 80.3),
      weight(3, 80.2),
      weight(4, 80.1),
      weight(5, 80),
      weight(6, 79.9),
    ];
    const trend = expectTrend(evaluateWeightTrend(measurements, REFERENCE));
    // The trend is pulled well below the 83 spike toward the ~80 body of the data.
    expect(trend.trendKg).toBeLessThan(81.5);
    expect(trend.trendKg).toBeGreaterThan(80);
  });

  it('reports a falling direction and a sensible weekly rate for a downward series', () => {
    const measurements = [
      weight(0, 79.4),
      weight(2, 79.7),
      weight(4, 80),
      weight(6, 80.3),
      weight(9, 80.6),
      weight(12, 80.9),
    ];
    const trend = expectTrend(evaluateWeightTrend(measurements, REFERENCE));
    expect(trend.direction).toBe('falling');
    expect(trend.changePerWeekKg).toBeLessThan(0);
    // Roughly 0.15 kg/day downward => about −1 kg/week.
    expect(trend.changePerWeekKg).toBeCloseTo(-1.05, 0);
  });

  it('reports a rising direction for an upward series', () => {
    const measurements = [
      weight(0, 81),
      weight(2, 80.7),
      weight(4, 80.4),
      weight(6, 80.1),
      weight(9, 79.8),
      weight(12, 79.5),
    ];
    const trend = expectTrend(evaluateWeightTrend(measurements, REFERENCE));
    expect(trend.direction).toBe('rising');
    expect(trend.changePerWeekKg).toBeGreaterThan(0);
  });

  it('reports steady when weight is flat within the deadband', () => {
    const measurements = [
      weight(0, 80.01),
      weight(2, 79.99),
      weight(4, 80.0),
      weight(6, 80.01),
      weight(9, 79.99),
      weight(12, 80.0),
    ];
    const trend = expectTrend(evaluateWeightTrend(measurements, REFERENCE));
    expect(trend.direction).toBe('steady');
    expect(Math.abs(trend.changePerWeekKg)).toBeLessThan(0.1);
  });
});

describe('evaluateWeightTrend — missing days vs a naive count-based EWMA', () => {
  // The core of docs/06 §6.6: a naive per-sample EWMA cannot tell two series apart when
  // they carry the same readings in the same order but with different gaps between the
  // days. Our time-weighted trend can, because it weights by real elapsed time.
  const valuesOldestFirst = [81, 80.5, 80, 79.5, 79, 78.5, 78];
  const valuesNewestFirst = [...valuesOldestFirst].slice().reverse();

  it('gives IDENTICAL naive output but DIFFERENT time-weighted trends for tight vs wide spacing', () => {
    // Series A: tightly spaced, one reading per day (ages 0..6).
    const tight = valuesNewestFirst.map((value, index) => weight(index, value));
    // Series B: the SAME readings in the SAME order, but spaced two days apart
    // (ages 0,2,4,6,8,10,12) — every other day skipped.
    const wide = valuesNewestFirst.map((value, index) =>
      weight(index * 2, value),
    );

    const tightTrend = expectTrend(evaluateWeightTrend(tight, REFERENCE));
    const wideTrend = expectTrend(evaluateWeightTrend(wide, REFERENCE));

    // A naive count-based EWMA is blind to the gaps: identical input order and values
    // => identical output for both spacings. That blindness is the bug.
    const naive = naiveCountEwma(valuesOldestFirst);
    expect(naive).toBeCloseTo(naive, 10); // (documents the single naive value)

    // Our trend is NOT blind: the wider spacing decays the older readings more, so its
    // smoothed level sits closer to the most recent reading (78) than the tight one.
    expect(wideTrend.trendKg).not.toBeCloseTo(tightTrend.trendKg, 2);
    expect(wideTrend.trendKg).toBeLessThan(tightTrend.trendKg);
    const mostRecent = 78;
    expect(Math.abs(wideTrend.trendKg - mostRecent)).toBeLessThan(
      Math.abs(tightTrend.trendKg - mostRecent),
    );
  });

  it('aggregates same-day readings by value, unlike a sequential per-sample EWMA', () => {
    const olderContext: TrendMeasurement[] = [
      weight(3, 80.5),
      weight(6, 81),
      weight(9, 81.5),
      weight(12, 82),
    ];
    // Two readings TODAY of 79 and 81 (they average to 80).
    const spread = [weight(0, 79), weight(0, 81), ...olderContext];
    // Two readings TODAY of 80 and 80 — same age, same count, same mean.
    const flat = [weight(0, 80), weight(0, 80), ...olderContext];

    const spreadTrend = expectTrend(evaluateWeightTrend(spread, REFERENCE));
    const flatTrend = expectTrend(evaluateWeightTrend(flat, REFERENCE));

    // Because weighting is by age, not by sequence, {79,81} and {80,80} on the same day
    // contribute identically — the trend and rate are exactly equal. A per-sample EWMA
    // processes them as two ordered time steps, so ending on 81 versus 80 leaves it in a
    // different state; that ordering-sensitivity is precisely the missing-day bug.
    expect(spreadTrend.trendKg).toBeCloseTo(flatTrend.trendKg, 10);
    expect(spreadTrend.changePerWeekKg).toBeCloseTo(
      flatTrend.changePerWeekKg,
      10,
    );

    const naiveSpread = naiveCountEwma([82, 81.5, 81, 80.5, 79, 81]);
    const naiveFlat = naiveCountEwma([82, 81.5, 81, 80.5, 80, 80]);
    expect(naiveSpread).not.toBeCloseTo(naiveFlat, 3);
  });
});

describe('evaluateWeightTrend — robustness', () => {
  it('is unaffected by the order of the input (out-of-order timestamps)', () => {
    const inOrder = [
      weight(0, 79.4),
      weight(2, 79.7),
      weight(4, 80),
      weight(6, 80.3),
      weight(9, 80.6),
      weight(12, 80.9),
    ];
    const shuffled = [
      inOrder[3],
      inOrder[0],
      inOrder[5],
      inOrder[1],
      inOrder[4],
      inOrder[2],
    ] as TrendMeasurement[];
    const a = expectTrend(evaluateWeightTrend(inOrder, REFERENCE));
    const b = expectTrend(evaluateWeightTrend(shuffled, REFERENCE));
    expect(b.trendKg).toBeCloseTo(a.trendKg, 10);
    expect(b.changePerWeekKg).toBeCloseTo(a.changePerWeekKg, 10);
  });

  it('ignores readings dated after the reference date', () => {
    const measurements = [
      weight(0, 80),
      weight(2, 80),
      weight(5, 80),
      weight(9, 80),
      weight(12, 80),
      weight(13, 80),
      weight(-2, 60), // a future-dated reading: must be ignored entirely
    ];
    const trend = expectTrend(evaluateWeightTrend(measurements, REFERENCE));
    expect(trend.inputs.weightCountConsidered).toBe(6);
    // The absurd future value never pulls the trend toward 60.
    expect(trend.trendKg).toBeCloseTo(80, 5);
  });

  it('never lets waist values affect the weight trend', () => {
    const weightsOnly = [
      weight(0, 80),
      weight(2, 80),
      weight(5, 80),
      weight(9, 80),
      weight(12, 80),
      weight(13, 80),
    ];
    const withWaist = [
      ...weightsOnly,
      waist(0, 95),
      waist(1, 96),
      waist(3, 94),
      waist(6, 97),
    ];
    const withoutWaist = expectTrend(
      evaluateWeightTrend(weightsOnly, REFERENCE),
    );
    const withWaistTrend = expectTrend(
      evaluateWeightTrend(withWaist, REFERENCE),
    );
    // The waist rows change neither the counts nor the computed trend.
    expect(withWaistTrend.inputs.weightCountConsidered).toBe(
      withoutWaist.inputs.weightCountConsidered,
    );
    expect(withWaistTrend.trendKg).toBeCloseTo(withoutWaist.trendKg, 10);
    expect(withWaistTrend.changePerWeekKg).toBeCloseTo(
      withoutWaist.changePerWeekKg,
      10,
    );
  });

  it('does not count waist rows toward sufficiency', () => {
    // Only two weights, but many waist rows — must stay insufficient.
    const measurements = [
      weight(0, 80),
      weight(3, 80),
      waist(0, 95),
      waist(1, 95),
      waist(2, 95),
      waist(3, 95),
      waist(4, 95),
      waist(5, 95),
    ];
    const result = evaluateWeightTrend(measurements, REFERENCE);
    expect(result.status).toBe('insufficient-data');
    if (result.status !== 'insufficient-data') {
      return;
    }
    expect(result.inputs.weightCountConsidered).toBe(2);
  });
});
