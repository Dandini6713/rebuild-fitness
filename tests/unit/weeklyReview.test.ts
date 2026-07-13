import { describe, expect, it } from '@jest/globals';

import type { WeeklyAlcoholSummary } from '@/domain/alcohol/alcoholUnits';
import type { WeightTrendResult } from '@/domain/measurements/weightTrend';
import {
  type CalorieAdjustmentDecision,
  evaluateCalorieAdjustment,
} from '@/domain/nutrition/calorieAdjustment';
import { summariseProteinWeek } from '@/domain/nutrition/proteinReport';
import {
  assembleWeeklyReview,
  RULE_VERSION,
  type SurfacedProposal,
} from '@/domain/review/weeklyReview';

const alcohol: WeeklyAlcoholSummary = {
  alcoholFreeDays: 5,
  daysInWindow: 7,
  percentOfLimit: 30,
  totalCalories: 400,
  totalDrinks: 2,
  totalUnits: 5,
  weeklyLimitUnits: 14,
};

const trend: WeightTrendResult = {
  changePerWeekKg: -0.4,
  direction: 'falling',
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

const calorie: CalorieAdjustmentDecision = evaluateCalorieAdjustment({
  adaptiveAdjustmentsEnabled: true,
  adherencePercent: 90,
  calorieFloor: 1500,
  currentTarget: { calories: 2000 },
  daysSinceTargetBegan: 30,
  invalidatingEvent: false,
  nutritionLoggedDayCount: 12,
  weightTrend: trend,
});

const strengthProposal: SurfacedProposal = {
  decision: 'increase',
  evidence: { exercise: 'leg-press', topOfRange: true },
  reasons: [
    { code: 'top-of-range', message: 'All sets reached the top of the range.' },
  ],
  ruleVersion: 'strength-progression/v1',
  status: 'proposed',
  summary: 'Increase leg press by 2.5 kg.',
};

const runningProposal: SurfacedProposal = {
  decision: 'advance',
  evidence: { fromStage: 3, toStage: 4 },
  reasons: [
    {
      code: 'advance-ready',
      message: 'You met everything needed to progress.',
    },
  ],
  ruleVersion: 'running-progression/v1',
  status: 'proposed',
  summary: 'Move up to stage 4.',
};

function assemble() {
  return assembleWeeklyReview({
    adherence: { completed: 3, percent: 75, planned: 4 },
    alcohol,
    calorie,
    period: { end: '2026-07-13', start: '2026-07-07' },
    proteinReport: summariseProteinWeek(
      [140, 140, 140, 140, 140, 140, 140],
      140,
    ),
    runningProposal,
    strengthProposals: [strengthProposal],
    weightTrend: trend,
  });
}

describe('assembleWeeklyReview (docs/05 §5.7, docs/06 §6.1/§6.10)', () => {
  it('carries the assembly rule version and the period', () => {
    const review = assemble();
    expect(review.ruleVersion).toBe(RULE_VERSION);
    expect(review.metrics.periodStart).toBe('2026-07-07');
    expect(review.metrics.periodEnd).toBe('2026-07-13');
  });

  it('snapshots the metrics from each engine honestly', () => {
    const review = assemble();
    expect(review.metrics.adherence).toEqual({
      completed: 3,
      percent: 75,
      planned: 4,
    });
    expect(review.metrics.protein.averageProteinG).toBe(140);
    expect(review.metrics.weightTrend).toEqual({
      changePerWeekKg: -0.4,
      direction: 'falling',
      status: 'trend',
      trendKg: 84,
    });
    expect(review.metrics.alcohol).toEqual(alcohol);
  });

  it('nulls the weight-trend fields when the trend is insufficient', () => {
    const review = assembleWeeklyReview({
      adherence: { completed: 0, percent: null, planned: 0 },
      alcohol,
      calorie,
      period: { end: '2026-07-13', start: '2026-07-07' },
      proteinReport: summariseProteinWeek([], 140),
      weightTrend: {
        inputs: trend.inputs,
        ruleVersion: 'weight-trend/v1',
        status: 'insufficient-data',
        unmetThresholds: ['three-in-seven'],
      },
    });
    expect(review.metrics.weightTrend.status).toBe('insufficient-data');
    expect(review.metrics.weightTrend.trendKg).toBeNull();
    expect(review.metrics.weightTrend.changePerWeekKg).toBeNull();
    expect(review.metrics.weightTrend.direction).toBeNull();
  });

  it('EVERY recommendation carries its evidence and rule version', () => {
    const review = assemble();
    expect(review.recommendations.length).toBe(3); // calorie + strength + running
    for (const rec of review.recommendations) {
      expect(rec.evidence).toBeDefined();
      expect(typeof rec.ruleVersion).toBe('string');
      expect(rec.ruleVersion.length).toBeGreaterThan(0);
      expect(rec.summary.length).toBeGreaterThan(0);
    }
  });

  it('surfaces the calorie decision with its own rule version and inputs (READ, not re-run)', () => {
    const review = assemble();
    const cal = review.recommendations.find((r) => r.source === 'calorie');
    expect(cal?.ruleVersion).toBe('calorie-adjustment/v1');
    expect(cal?.evidence).toBe(calorie.inputs);
    // A within-range no-change is informational, not actionable.
    expect(cal?.decision).toBe('no-change');
    expect(cal?.actionable).toBe(false);
    expect(cal?.status).toBe('none');
  });

  it('marks an actionable calorie proposal as proposed', () => {
    const reduction = evaluateCalorieAdjustment({
      adaptiveAdjustmentsEnabled: true,
      adherencePercent: 90,
      calorieFloor: 1500,
      currentTarget: { calories: 2000 },
      daysSinceTargetBegan: 30,
      invalidatingEvent: false,
      nutritionLoggedDayCount: 12,
      weightTrend: { ...trend, changePerWeekKg: -0.02, direction: 'steady' },
    });
    const review = assembleWeeklyReview({
      adherence: { completed: 3, percent: 90, planned: 4 },
      alcohol,
      calorie: reduction,
      period: { end: '2026-07-13', start: '2026-07-07' },
      proteinReport: summariseProteinWeek([140], 140),
      weightTrend: trend,
    });
    const cal = review.recommendations.find((r) => r.source === 'calorie');
    expect(cal?.decision).toBe('propose-reduction');
    expect(cal?.actionable).toBe(true);
    expect(cal?.status).toBe('proposed');
  });

  it('surfaces strength and running proposals with their stored evidence and version', () => {
    const review = assemble();
    const strength = review.recommendations.find(
      (r) => r.source === 'strength',
    );
    expect(strength?.decision).toBe('increase');
    expect(strength?.ruleVersion).toBe('strength-progression/v1');
    expect(strength?.evidence).toBe(strengthProposal.evidence);
    expect(strength?.actionable).toBe(true);

    const running = review.recommendations.find((r) => r.source === 'running');
    expect(running?.decision).toBe('advance');
    expect(running?.ruleVersion).toBe('running-progression/v1');
    expect(running?.actionable).toBe(true);
  });

  it('treats a non-actionable strength hold as informational', () => {
    const review = assembleWeeklyReview({
      adherence: { completed: 3, percent: 75, planned: 4 },
      alcohol,
      calorie,
      period: { end: '2026-07-13', start: '2026-07-07' },
      proteinReport: summariseProteinWeek([140], 140),
      strengthProposals: [
        { ...strengthProposal, decision: 'hold', summary: 'Hold the weight.' },
      ],
      weightTrend: trend,
    });
    const strength = review.recommendations.find(
      (r) => r.source === 'strength',
    );
    expect(strength?.actionable).toBe(false);
    expect(strength?.status).toBe('none');
  });

  it('attaches the concrete calorie change to an actionable proposal (for the confirm path)', () => {
    const reduction = evaluateCalorieAdjustment({
      adaptiveAdjustmentsEnabled: true,
      adherencePercent: 90,
      calorieFloor: 1500,
      currentTarget: { calories: 2000 },
      daysSinceTargetBegan: 30,
      invalidatingEvent: false,
      nutritionLoggedDayCount: 12,
      weightTrend: { ...trend, changePerWeekKg: -0.02, direction: 'steady' },
    });
    const review = assembleWeeklyReview({
      adherence: { completed: 3, percent: 90, planned: 4 },
      alcohol,
      calorie: reduction,
      period: { end: '2026-07-13', start: '2026-07-07' },
      proteinReport: summariseProteinWeek([140], 140),
      weightTrend: trend,
    });
    const cal = review.recommendations.find((r) => r.source === 'calorie');
    expect(cal?.change).toEqual({
      deltaKcal: reduction.deltaKcal,
      professionalReviewRequired: false,
      proposedTargetCalories: reduction.proposedTargetCalories,
    });
  });

  it('carries no change on a non-actionable calorie item', () => {
    const review = assemble();
    const cal = review.recommendations.find((r) => r.source === 'calorie');
    expect(cal?.change).toBeUndefined();
  });

  it('threads a surfaced proposal id through for the confirm path', () => {
    const review = assembleWeeklyReview({
      adherence: { completed: 3, percent: 75, planned: 4 },
      alcohol,
      calorie,
      period: { end: '2026-07-13', start: '2026-07-07' },
      proteinReport: summariseProteinWeek([140], 140),
      runningProposal: { ...runningProposal, proposalId: 'run-9' },
      strengthProposals: [{ ...strengthProposal, proposalId: 'str-7' }],
      weightTrend: trend,
    });
    expect(
      review.recommendations.find((r) => r.source === 'strength')?.proposalId,
    ).toBe('str-7');
    expect(
      review.recommendations.find((r) => r.source === 'running')?.proposalId,
    ).toBe('run-9');
  });

  it('omits progression recommendations when there are none', () => {
    const review = assembleWeeklyReview({
      adherence: { completed: 0, percent: null, planned: 0 },
      alcohol,
      calorie,
      period: { end: '2026-07-13', start: '2026-07-07' },
      proteinReport: summariseProteinWeek([], 140),
      weightTrend: trend,
    });
    expect(review.recommendations.map((r) => r.source)).toEqual(['calorie']);
  });
});
