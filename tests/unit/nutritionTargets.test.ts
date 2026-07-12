import { describe, expect, it } from '@jest/globals';

import {
  computeNutrientProgress,
  type NutritionTarget,
  resolveCurrentNutritionTarget,
} from '@/domain/nutrition/nutritionTargets';

const target = (
  effectiveFrom: string,
  calories: number,
  proteinG: number,
): NutritionTarget => ({ calories, effectiveFrom, proteinG });

describe('resolveCurrentNutritionTarget', () => {
  it('returns null when there are no targets', () => {
    expect(resolveCurrentNutritionTarget([], '2026-07-12')).toBeNull();
  });

  it('picks the latest target on or before today', () => {
    const targets = [
      target('2026-06-01', 2200, 140),
      target('2026-07-01', 2100, 145),
      target('2026-05-01', 2300, 135),
    ];
    expect(resolveCurrentNutritionTarget(targets, '2026-07-12')).toEqual(
      target('2026-07-01', 2100, 145),
    );
  });

  it('includes a target that takes effect exactly today', () => {
    const targets = [target('2026-07-12', 2000, 150)];
    expect(resolveCurrentNutritionTarget(targets, '2026-07-12')?.calories).toBe(
      2000,
    );
  });

  it('ignores future-dated targets until they take effect', () => {
    const targets = [
      target('2026-07-01', 2100, 145),
      target('2026-08-01', 1900, 150),
    ];
    expect(
      resolveCurrentNutritionTarget(targets, '2026-07-12')?.effectiveFrom,
    ).toBe('2026-07-01');
  });

  it('returns null when every target is still in the future', () => {
    const targets = [target('2026-08-01', 1900, 150)];
    expect(resolveCurrentNutritionTarget(targets, '2026-07-12')).toBeNull();
  });
});

describe('computeNutrientProgress', () => {
  it('computes remaining and percent for a partial day', () => {
    expect(computeNutrientProgress(2100, 1400)).toEqual({
      consumed: 1400,
      percent: 67,
      remaining: 700,
      target: 2100,
    });
  });

  it('never reports negative remaining and caps percent at 100', () => {
    expect(computeNutrientProgress(2000, 2500)).toEqual({
      consumed: 2500,
      percent: 100,
      remaining: 0,
      target: 2000,
    });
  });

  it('clamps negative consumed to zero', () => {
    expect(computeNutrientProgress(2000, -50)).toEqual({
      consumed: 0,
      percent: 0,
      remaining: 2000,
      target: 2000,
    });
  });

  it('reports zero percent against a zero target rather than dividing by zero', () => {
    expect(computeNutrientProgress(0, 0).percent).toBe(0);
  });
});
