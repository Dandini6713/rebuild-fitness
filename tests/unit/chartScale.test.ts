import { describe, expect, it } from '@jest/globals';

import {
  computeBarScale,
  computePointScale,
  pointFraction,
} from '@/domain/progress/chartScale';

// The pure scale/axis logic is where docs/09 §9.6 "do not truncate the vertical axis in a
// misleading way" is actually enforced, so it is tested exhaustively: the baseline choice
// per series, that a truncated/misleading axis is never produced, and how sparse data
// maps into the plot.

describe('computeBarScale — zero baseline, never truncated', () => {
  it('always uses a zero baseline (bars are only truthful from zero)', () => {
    const scale = computeBarScale([40, 55, 70]);
    expect(scale.baseline).toBe(0);
  });

  it('maps each value to value / max, all within [0, 1]', () => {
    const scale = computeBarScale([50, 100]);
    // max snaps to a nice 100, so 50 -> 0.5 and 100 -> 1.
    expect(scale.max).toBe(100);
    expect(scale.fractions).toEqual([0.5, 1]);
    for (const fraction of scale.fractions) {
      expect(fraction).not.toBeNull();
      expect(fraction as number).toBeGreaterThanOrEqual(0);
      expect(fraction as number).toBeLessThanOrEqual(1);
    }
  });

  it('preserves nulls (a bucket with no data is not a zero achievement)', () => {
    const scale = computeBarScale([null, 2, null]);
    expect(scale.fractions[0]).toBeNull();
    expect(scale.fractions[2]).toBeNull();
    expect(scale.fractions[1]).not.toBeNull();
  });

  it('keeps a reference value on-scale so a bar below target does not read as at target', () => {
    // Weekly protein averages all below a 140 g target.
    const scale = computeBarScale([90, 110, 120], { referenceValue: 140 });
    expect(scale.max).toBeGreaterThanOrEqual(140);
    expect(scale.referenceFraction).not.toBeNull();
    // No bar reaches the top, so none looks like it hit the target.
    for (const fraction of scale.fractions) {
      expect(fraction as number).toBeLessThan(1);
    }
  });

  it('handles an all-zero / empty series without dividing by zero', () => {
    expect(computeBarScale([]).max).toBeGreaterThan(0);
    const zeros = computeBarScale([0, 0, 0]);
    expect(zeros.fractions).toEqual([0, 0, 0]);
    expect(zeros.baseline).toBe(0);
  });

  it('produces round, ascending ticks starting at zero', () => {
    const scale = computeBarScale([0, 42]);
    expect(scale.ticks[0]).toBe(0);
    expect(scale.ticks[scale.ticks.length - 1]).toBe(scale.max);
    for (let i = 1; i < scale.ticks.length; i += 1) {
      expect(scale.ticks[i]!).toBeGreaterThan(scale.ticks[i - 1]!);
    }
  });
});

describe('computePointScale — honest, labelled non-zero baseline for body measurements', () => {
  it('chooses a NON-zero baseline below the lowest reading (zero would flatten weight)', () => {
    const values = [74, 74.5, 73.8, 74.2];
    const scale = computePointScale(values);
    expect(scale.baselineIsZero).toBe(false);
    expect(scale.baseline).toBeLessThanOrEqual(Math.min(...values));
    expect(scale.top).toBeGreaterThanOrEqual(Math.max(...values));
  });

  it('never maps a reading outside [0, 1] (baseline ≤ min, top ≥ max)', () => {
    const values = [80.1, 79.4, 81.9, 78.2];
    const scale = computePointScale(values);
    for (const fraction of scale.fractions) {
      expect(fraction).toBeGreaterThanOrEqual(0);
      expect(fraction).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonic — a higher reading always sits higher on the axis', () => {
    const scale = computePointScale([70, 72, 74]);
    expect(scale.fractions[0]!).toBeLessThan(scale.fractions[1]!);
    expect(scale.fractions[1]!).toBeLessThan(scale.fractions[2]!);
  });

  it('centres a SINGLE reading (≈ 0.5), so one weigh-in never looks like a trend', () => {
    const scale = computePointScale([74]);
    expect(scale.baselineIsZero).toBe(false);
    expect(scale.fractions).toHaveLength(1);
    expect(scale.fractions[0]!).toBeGreaterThan(0.3);
    expect(scale.fractions[0]!).toBeLessThan(0.7);
  });

  it('centres a dead-flat series in a symmetric band rather than pinning it to an edge', () => {
    const scale = computePointScale([74, 74, 74]);
    for (const fraction of scale.fractions) {
      expect(fraction).toBeGreaterThan(0.3);
      expect(fraction).toBeLessThan(0.7);
    }
  });

  it('returns an empty, safe scale for no readings (the tile shows insufficient-data)', () => {
    const scale = computePointScale([]);
    expect(scale.fractions).toEqual([]);
    expect(scale.top).toBe(0);
  });

  it('can be forced to a zero baseline when zero is meaningful', () => {
    const scale = computePointScale([2, 4, 6], { zeroBaseline: true });
    expect(scale.baseline).toBe(0);
    expect(scale.baselineIsZero).toBe(true);
  });

  it('distinguishes two series with the same span but different levels (the axis adapts)', () => {
    // Two identical shapes at different weights map to the same fractions but DIFFERENT
    // labelled baselines — the magnification is always disclosed via the baseline value.
    const low = computePointScale([60, 61, 62]);
    const high = computePointScale([90, 91, 92]);
    expect(low.fractions).toEqual(high.fractions);
    expect(low.baseline).not.toBe(high.baseline);
    expect(low.baselineIsZero).toBe(false);
    expect(high.baselineIsZero).toBe(false);
  });
});

describe('pointFraction', () => {
  it('places a value in the same [0,1] frame as the scale, clamped', () => {
    const scale = computePointScale([70, 74]);
    expect(pointFraction(scale, scale.baseline)).toBeCloseTo(0, 5);
    expect(pointFraction(scale, scale.top)).toBeCloseTo(1, 5);
    // Out-of-range values clamp to an edge rather than going off-plot.
    expect(pointFraction(scale, scale.top + 100)).toBe(1);
    expect(pointFraction(scale, scale.baseline - 100)).toBe(0);
  });
});
