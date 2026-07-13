import { describe, expect, it } from '@jest/globals';

import type { WeightTrendResult } from '@/domain/measurements/weightTrend';
import {
  ADJUSTMENT_STEP_KCAL,
  type CalorieAdjustmentInput,
  evaluateCalorieAdjustment,
  RULE_VERSION,
} from '@/domain/nutrition/calorieAdjustment';

// A 'trend' weight-trend result with a given signed weekly rate (negative = falling). The
// other fields are plausible but unread by the calorie engine (it reads changePerWeekKg and
// the status only).
function trend(changePerWeekKg: number): WeightTrendResult {
  return {
    changePerWeekKg,
    direction:
      changePerWeekKg < -0.1
        ? 'falling'
        : changePerWeekKg > 0.1
          ? 'rising'
          : 'steady',
    inputs: {
      countWithinLongWindow: 8,
      countWithinShortWindow: 4,
      longWindowDays: 14,
      longWindowMinCount: 6,
      referenceDateIso: '2026-07-13T00:00:00.000Z',
      shortWindowDays: 7,
      shortWindowMinCount: 3,
      tauDays: 7,
      weightCountConsidered: 8,
    },
    ruleVersion: 'weight-trend/v1',
    status: 'trend',
    trendKg: 84,
  };
}

// An insufficient-data weight-trend result (the trend engine's own sufficiency was not met).
function insufficientTrend(): WeightTrendResult {
  return {
    inputs: {
      countWithinLongWindow: 2,
      countWithinShortWindow: 1,
      longWindowDays: 14,
      longWindowMinCount: 6,
      referenceDateIso: '2026-07-13T00:00:00.000Z',
      shortWindowDays: 7,
      shortWindowMinCount: 3,
      tauDays: 7,
      weightCountConsidered: 2,
    },
    ruleVersion: 'weight-trend/v1',
    status: 'insufficient-data',
    unmetThresholds: ['three-in-seven', 'six-in-fourteen'],
  };
}

// The happy-path base input: every gate passes, adherence is met, target 2000 kcal, floor
// 1500. Individual tests override just the field under test. `loss` is expressed via the
// signed changePerWeekKg (loss 0.4 → changePerWeekKg -0.4).
function base(
  overrides: Partial<CalorieAdjustmentInput> = {},
): CalorieAdjustmentInput {
  return {
    adaptiveAdjustmentsEnabled: true,
    adherencePercent: 90,
    calorieFloor: 1500,
    currentTarget: { calories: 2000 },
    daysSinceTargetBegan: 30,
    invalidatingEvent: false,
    nutritionLoggedDayCount: 12,
    weightTrend: trend(-0.4), // 0.4 kg/week loss, within the target band
    ...overrides,
  };
}

describe('evaluateCalorieAdjustment — result shape (docs/06 §6.1)', () => {
  it('always carries the rule version, the evidence inputs and a next action', () => {
    const result = evaluateCalorieAdjustment(base());
    expect(result.ruleVersion).toBe(RULE_VERSION);
    expect(result.nextAction.length).toBeGreaterThan(0);
    expect(result.inputs.minDaysSinceTarget).toBe(14);
    expect(result.inputs.minNutritionDays).toBe(10);
    expect(result.inputs.weightTrendStatus).toBe('trend');
    expect(result.inputs.lossPerWeekKg).toBeCloseTo(0.4, 5);
  });
});

describe('evaluateCalorieAdjustment — eligibility gates fail safe to no change', () => {
  // The one hard property: an unmet gate (or a missing input a gate needs) must yield
  // not-eligible with NO calorie change — never a reduction on absent data.
  const expectNoChange = (input: CalorieAdjustmentInput) => {
    const result = evaluateCalorieAdjustment(input);
    expect(result.decision).toBe('not-eligible');
    expect(result.deltaKcal).toBeNull();
    expect(result.proposedTargetCalories).toBeNull();
    expect(result.professionalReviewRequired).toBe(false);
    return result;
  };

  it('is not eligible when the target is too recent (day 13, boundary below 14)', () => {
    const result = expectNoChange(base({ daysSinceTargetBegan: 13 }));
    expect(result.reasons.map((r) => r.code)).toContain('target-too-recent');
  });

  it('is eligible at exactly 14 days (boundary)', () => {
    // Combined with a within-range loss so the decision is a clean no-change, proving the
    // gate itself passed at 14.
    const result = evaluateCalorieAdjustment(
      base({ daysSinceTargetBegan: 14 }),
    );
    expect(result.decision).toBe('no-change');
  });

  it('is not eligible when weight data is insufficient (trend engine sufficiency reused)', () => {
    const result = expectNoChange(base({ weightTrend: insufficientTrend() }));
    expect(result.reasons.map((r) => r.code)).toContain(
      'insufficient-weight-data',
    );
  });

  it('is not eligible with 9 of 14 nutrition days, eligible with 10 (boundary)', () => {
    const nine = expectNoChange(base({ nutritionLoggedDayCount: 9 }));
    expect(nine.reasons.map((r) => r.code)).toContain(
      'insufficient-nutrition-logging',
    );
    const ten = evaluateCalorieAdjustment(
      base({ nutritionLoggedDayCount: 10 }),
    );
    expect(ten.decision).toBe('no-change'); // gate passes at 10
  });

  it('is not eligible when an invalidating event is flagged', () => {
    const result = expectNoChange(base({ invalidatingEvent: true }));
    expect(result.reasons.map((r) => r.code)).toContain('invalidating-event');
  });

  it('is not eligible when adaptive adjustments are disabled, regardless of data', () => {
    // Even with a data pattern that would otherwise propose a reduction (stalled loss, good
    // adherence), the disabled flag blocks any change.
    const result = expectNoChange(
      base({
        adaptiveAdjustmentsEnabled: false,
        adherencePercent: 95,
        weightTrend: trend(-0.02),
      }),
    );
    expect(result.reasons.map((r) => r.code)).toContain(
      'adaptive-adjustments-disabled',
    );
  });

  it('is not eligible when there is no current target to adjust', () => {
    const result = expectNoChange(
      base({ currentTarget: null, daysSinceTargetBegan: null }),
    );
    expect(result.reasons.map((r) => r.code)).toContain('no-current-target');
  });

  it('reports every unmet gate together, not just the first', () => {
    const result = evaluateCalorieAdjustment(
      base({
        adaptiveAdjustmentsEnabled: false,
        daysSinceTargetBegan: 5,
        nutritionLoggedDayCount: 3,
        weightTrend: insufficientTrend(),
      }),
    );
    const codes = result.reasons.map((r) => r.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        'adaptive-adjustments-disabled',
        'target-too-recent',
        'insufficient-weight-data',
        'insufficient-nutrition-logging',
      ]),
    );
  });
});

describe('evaluateCalorieAdjustment — adjustment rules and boundaries (docs/06 §6.7)', () => {
  it('loss within 0.2–0.6 kg/wk → no change', () => {
    expect(
      evaluateCalorieAdjustment(base({ weightTrend: trend(-0.4) })).decision,
    ).toBe('no-change');
  });

  it('loss exactly 0.2 and exactly 0.6 → no change (band is inclusive)', () => {
    expect(
      evaluateCalorieAdjustment(base({ weightTrend: trend(-0.2) })).decision,
    ).toBe('no-change');
    expect(
      evaluateCalorieAdjustment(base({ weightTrend: trend(-0.6) })).decision,
    ).toBe('no-change');
  });

  it('loss exactly 0.1 → no change (reduction needs strictly below 0.1)', () => {
    const result = evaluateCalorieAdjustment(
      base({ weightTrend: trend(-0.1) }),
    );
    expect(result.decision).toBe('no-change');
  });

  it('loss below 0.1 with adherence ≥ 80 → propose a bounded reduction', () => {
    const result = evaluateCalorieAdjustment(
      base({ adherencePercent: 85, weightTrend: trend(-0.05) }),
    );
    expect(result.decision).toBe('propose-reduction');
    expect(result.deltaKcal).toBe(-ADJUSTMENT_STEP_KCAL);
    expect(result.proposedTargetCalories).toBe(2000 - ADJUSTMENT_STEP_KCAL);
    expect(Math.abs(result.deltaKcal ?? 0)).toBeGreaterThanOrEqual(100);
    expect(Math.abs(result.deltaKcal ?? 0)).toBeLessThanOrEqual(150);
    expect(result.reasons.map((r) => r.code)).toContain('loss-stalled');
  });

  it('weight increasing with adherence ≥ 80 → propose a reduction', () => {
    const result = evaluateCalorieAdjustment(
      base({ adherencePercent: 90, weightTrend: trend(0.15) }),
    );
    expect(result.decision).toBe('propose-reduction');
    expect(result.deltaKcal).toBe(-ADJUSTMENT_STEP_KCAL);
    expect(result.reasons.map((r) => r.code)).toContain('weight-increasing');
  });

  it('low loss with adherence 79 → NOT eligible for a reduction (needs ≥ 80)', () => {
    const at79 = evaluateCalorieAdjustment(
      base({ adherencePercent: 79, weightTrend: trend(-0.02) }),
    );
    expect(at79.decision).toBe('no-change');
    expect(at79.deltaKcal).toBeNull();
    expect(at79.reasons.map((r) => r.code)).toContain(
      'adherence-below-threshold',
    );

    const at80 = evaluateCalorieAdjustment(
      base({ adherencePercent: 80, weightTrend: trend(-0.02) }),
    );
    expect(at80.decision).toBe('propose-reduction');
  });

  it('low loss with null adherence → no change (fail-safe, never a reduction)', () => {
    const result = evaluateCalorieAdjustment(
      base({ adherencePercent: null, weightTrend: trend(-0.02) }),
    );
    expect(result.decision).toBe('no-change');
    expect(result.deltaKcal).toBeNull();
  });

  it('loss exactly 0.8 → no change (rapid needs strictly above 0.8)', () => {
    expect(
      evaluateCalorieAdjustment(base({ weightTrend: trend(-0.8) })).decision,
    ).toBe('no-change');
  });

  it('loss above 0.8 → propose an increase with a review-logging note', () => {
    const result = evaluateCalorieAdjustment(
      base({ weightTrend: trend(-0.9) }),
    );
    expect(result.decision).toBe('propose-increase');
    expect(result.deltaKcal).toBe(ADJUSTMENT_STEP_KCAL);
    expect(result.proposedTargetCalories).toBe(2000 + ADJUSTMENT_STEP_KCAL);
    expect(result.reasons.map((r) => r.code)).toContain(
      'review-logging-accuracy',
    );
  });

  it('rapid loss proposes an increase even with low adherence (no adherence gate on this branch)', () => {
    const result = evaluateCalorieAdjustment(
      base({ adherencePercent: 40, weightTrend: trend(-1.2) }),
    );
    expect(result.decision).toBe('propose-increase');
  });

  it('loss between 0.6 and 0.8 (0.7) → no change (outside band, no rule triggers)', () => {
    const result = evaluateCalorieAdjustment(
      base({ weightTrend: trend(-0.7) }),
    );
    expect(result.decision).toBe('no-change');
    expect(result.reasons.map((r) => r.code)).toContain('no-rule-triggered');
  });

  it('loss between 0.1 and 0.2 (0.15) → no change', () => {
    expect(
      evaluateCalorieAdjustment(base({ weightTrend: trend(-0.15) })).decision,
    ).toBe('no-change');
  });
});

describe('evaluateCalorieAdjustment — calorie floor is never silently breached (docs/06 §6.7)', () => {
  it('clamps a reduction to the floor and flags professional review', () => {
    // Target 1550, step 100 → desired 1450 < floor 1500. Clamp to 1500, delta -50, flagged.
    const result = evaluateCalorieAdjustment(
      base({
        adherencePercent: 90,
        currentTarget: { calories: 1550 },
        weightTrend: trend(-0.02),
      }),
    );
    expect(result.decision).toBe('propose-reduction');
    expect(result.proposedTargetCalories).toBe(1500);
    expect(result.deltaKcal).toBe(-50);
    expect(result.professionalReviewRequired).toBe(true);
    expect(result.reasons.map((r) => r.code)).toContain('floor-reached');
  });

  it('never proposes below the floor when already at it (delta 0, flagged)', () => {
    const result = evaluateCalorieAdjustment(
      base({
        adherencePercent: 90,
        currentTarget: { calories: 1500 },
        weightTrend: trend(-0.02),
      }),
    );
    expect(result.proposedTargetCalories).toBe(1500);
    expect(result.deltaKcal).toBe(0);
    expect(result.professionalReviewRequired).toBe(true);
  });

  it('does not flag professional review when the reduction stays above the floor', () => {
    const result = evaluateCalorieAdjustment(
      base({
        adherencePercent: 90,
        currentTarget: { calories: 2000 },
        weightTrend: trend(-0.02),
      }),
    );
    expect(result.proposedTargetCalories).toBe(1900);
    expect(result.professionalReviewRequired).toBe(false);
  });
});

describe('evaluateCalorieAdjustment — insufficient logging prevents a change in every form', () => {
  // docs/10 §10.2: "Insufficient logs prevent calorie changes." Each insufficiency, on its
  // own, must block any change — even when the weight pattern would otherwise cut calories.
  const stalledLossGoodAdherence = {
    adherencePercent: 95,
    weightTrend: trend(-0.02),
  };

  it('insufficient weight logging → no change', () => {
    const result = evaluateCalorieAdjustment(
      base({ ...stalledLossGoodAdherence, weightTrend: insufficientTrend() }),
    );
    expect(result.decision).toBe('not-eligible');
    expect(result.deltaKcal).toBeNull();
  });

  it('insufficient nutrition logging → no change', () => {
    const result = evaluateCalorieAdjustment(
      base({ ...stalledLossGoodAdherence, nutritionLoggedDayCount: 8 }),
    );
    expect(result.decision).toBe('not-eligible');
    expect(result.deltaKcal).toBeNull();
  });

  it('too-recent target → no change', () => {
    const result = evaluateCalorieAdjustment(
      base({ ...stalledLossGoodAdherence, daysSinceTargetBegan: 10 }),
    );
    expect(result.decision).toBe('not-eligible');
    expect(result.deltaKcal).toBeNull();
  });
});
