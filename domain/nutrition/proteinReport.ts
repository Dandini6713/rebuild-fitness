// The protein weekly report from docs/06 §6.8, as a small pure function with no React and
// no I/O. §6.8: "The weekly report uses a seven-day average and number of days within ten
// per cent of target." It reuses the daily protein totals the diary already computes
// (nutritionDiary.summariseDiary) and the effective protein target
// (nutritionTargets.resolveCurrentNutritionTarget) — it derives nothing new, it summarises.
//
// It is a REPORT, not a recommendation: it never proposes a target change (protein has no
// adaptive-adjustment rule, unlike calories §6.7). It is versioned for the §6.10 discipline
// so a stored weekly review records which report produced its protein numbers.

export const RULE_VERSION = 'protein-report/v1';

// "within ten per cent of target" (docs/06 §6.8), read as ±10%: a day counts when its total
// is within TOLERANCE_FRACTION of the target in either direction.
export const TOLERANCE_FRACTION = 0.1;

export type ProteinReport = {
  averageProteinG: number; // seven-day average, two decimals
  daysWithinTarget: number; // days within ±10% of target
  daysConsidered: number; // days in the window (usually 7)
  targetProteinG: number;
  tolerancePercent: number; // 10, for display ("within 10% of target")
  ruleVersion: string;
};

// Round grams to two decimal places (matching the numeric(6,2) protein column), avoiding
// binary drift by rounding at the boundary.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Summarise a window of DAILY protein totals against the effective target. `dailyProteinG`
// holds one total per day in the window (typically seven), so the average is over the whole
// window — an unlogged day contributes 0 and pulls the average down honestly rather than
// being dropped. A day is "within target" when |total − target| <= 10% of target; at a zero
// target every day trivially fails the tolerance (0 is not a meaningful protein goal), so
// daysWithinTarget is 0. An empty window yields a zero average and zero days.
export function summariseProteinWeek(
  dailyProteinG: readonly number[],
  targetProteinG: number,
): ProteinReport {
  const daysConsidered = dailyProteinG.length;
  const total = dailyProteinG.reduce((sum, value) => sum + value, 0);
  const averageProteinG =
    daysConsidered === 0 ? 0 : round2(total / daysConsidered);

  const tolerance = targetProteinG * TOLERANCE_FRACTION;
  const daysWithinTarget =
    targetProteinG <= 0
      ? 0
      : dailyProteinG.filter(
          (value) => Math.abs(value - targetProteinG) <= tolerance,
        ).length;

  return {
    averageProteinG,
    daysConsidered,
    daysWithinTarget,
    ruleVersion: RULE_VERSION,
    targetProteinG,
    tolerancePercent: Math.round(TOLERANCE_FRACTION * 100),
  };
}
