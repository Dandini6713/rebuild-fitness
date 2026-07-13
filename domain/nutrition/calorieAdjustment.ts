// The calorie-adjustment ELIGIBILITY engine from docs/06 §6.7, as a small pure function
// with no React and no I/O — the caller passes the weight trend, adherence, logging counts
// and configuration, and it returns a §6.1 decision. It is the sibling of
// strengthProgression.ts and runningProgression.ts: it PROPOSES, it never applies, and it
// never writes.
//
// THE ONE HARD, NON-NEGOTIABLE PROPERTY (docs/06 §6.7, docs/10 §10.2 "Insufficient logs
// prevent calorie changes"). A wrongly-eligible calorie change is the worst failure this
// module can produce, so the design is fail-safe FIRST: any gate that is unmet — or any
// input a gate needs that is missing or unknown — yields `not-eligible` with NO calorie
// change. A reduction is only ever proposed on positive, sufficient evidence; absent data is
// never read as "safe to cut calories". This is the property the roadmap-19 local-day
// nutrition-day fix was protecting: the "nutrition logged on N of 14 days" count MUST be a
// LOCAL-day count (computed upstream via nutritionDiary.dayWindow), or this gate is wrong.
//
// Nothing here diagnoses or treats anything (docs/07); a calorie proposal is a training/
// nutrition suggestion the user must accept, never automatic, and never below the safety
// floor without a professional-review note. There is no shame-based or compensatory logic —
// §6.9's ban on fasting/skipping/over-exercise is upheld: this engine only ever proposes a
// modest, bounded daily kcal delta, clamped by the floor.

import type { WeightTrendResult } from '@/domain/measurements/weightTrend';

export const RULE_VERSION = 'calorie-adjustment/v1';

// --- Data-sufficiency gate constants (docs/06 §6.7) --------------------------

// "At least fourteen days have passed since the current target began."
export const MIN_DAYS_SINCE_TARGET = 14;
// "Nutrition is logged on at least ten of fourteen days." The count is over a 14-day window
// and MUST be a LOCAL-day count (see the header).
export const MIN_NUTRITION_DAYS = 10;
export const NUTRITION_WINDOW_DAYS = 14;

// --- Target-rate and adjustment constants (docs/06 §6.7) ---------------------

// "Default desired loss range: 0.2 to 0.6 kg per week." A loss within this band needs no
// change. All rates are kg per week; a positive `lossPerWeekKg` means weight is falling.
export const TARGET_LOSS_MIN_KG = 0.2;
export const TARGET_LOSS_MAX_KG = 0.6;
// "If loss is below 0.1 kg per week and adherence is at least 80%, propose a reduction."
export const LOW_LOSS_THRESHOLD_KG = 0.1;
// "If loss exceeds 0.8 kg per week, propose an increase or a review of logging accuracy."
export const RAPID_LOSS_THRESHOLD_KG = 0.8;
// "adherence is at least 80 per cent."
export const ADHERENCE_MIN_PERCENT = 80;

// The bounded daily kcal step. docs/06 §6.7 permits 100–150 kcal per day for a reduction,
// "up to 150" when weight is increasing, and 100–150 for an increase. A single conservative
// default of 100 kcal is used for every adjustment — always within the 100–150 band, the
// smallest sensible change, and the one point to change if the band is ever revisited. The
// magnitude is deliberately bounded so no single review can propose a large swing.
export const ADJUSTMENT_STEP_KCAL = 100;

export type CalorieDecisionCode =
  'no-change' | 'propose-reduction' | 'propose-increase' | 'not-eligible';

// A structured, human-readable reason: a stable code plus a plain British-English sentence
// (docs/06 §6.1). No shame-based language, nothing implying diagnosis (docs/07).
export type CalorieReason = {
  code: string;
  message: string;
};

// The current effective nutrition target the proposal adjusts (resolved upstream via
// nutritionTargets.resolveCurrentNutritionTarget). Only calories are needed here.
export type CurrentTarget = {
  calories: number;
};

// Everything the rule reads for one evaluation. Every field a gate depends on is nullable
// where it can legitimately be unknown, so the fail-safe can catch a missing input.
export type CalorieAdjustmentInput = {
  // The weight-trend engine's OWN result (roadmap 18). The gate reuses its sufficiency: a
  // 'trend' status means weight logging met its 3-in-7 AND 6-in-14 thresholds; an
  // 'insufficient-data' status fails the gate. The signed `changePerWeekKg` drives the
  // adjustment; the label deadband is display-only and is not read here.
  weightTrend: WeightTrendResult;
  // Weekly session adherence as a whole-number percentage, or null when there is nothing
  // planned to adhere to (computeWeeklyAdherence returns null). A reduction requires
  // adherence >= 80, so a null adherence can never justify a reduction (fail-safe).
  adherencePercent: number | null;
  // Days in the last 14 LOCAL days on which nutrition was logged (see the header).
  nutritionLoggedDayCount: number;
  // Whole days since the current target's effective_from, or null when no target exists.
  daysSinceTargetBegan: number | null;
  // The current effective target, or null when none is set (nothing to adjust).
  currentTarget: CurrentTarget | null;
  // The conservative safety floor (profiles.calorie_floor). A resulting target is never
  // proposed below this without a professional-review note.
  calorieFloor: number;
  // profiles.adaptive_adjustments_enabled. When false, no change is proposed regardless of
  // data (a hard gate).
  adaptiveAdjustmentsEnabled: boolean;
  // Optional illness/travel/unusual-event flag invalidating the period (docs/06 §6.7). No
  // capture UI exists yet (a declared seam), so it defaults to false ("no event") and the
  // engine honours it once a later step captures it — the same seam shape as the readiness
  // optional inputs.
  invalidatingEvent?: boolean;
};

// The inputs actually used to reach the decision (docs/06 §6.1), for the audit trail and
// for explaining a not-eligible result. JSON-serialisable, no undefined values.
export type CalorieAdjustmentInputs = {
  weightTrendStatus: WeightTrendResult['status'];
  changePerWeekKg: number | null;
  lossPerWeekKg: number | null;
  adherencePercent: number | null;
  nutritionLoggedDayCount: number;
  nutritionWindowDays: number;
  minNutritionDays: number;
  daysSinceTargetBegan: number | null;
  minDaysSinceTarget: number;
  currentTargetCalories: number | null;
  calorieFloor: number;
  adaptiveAdjustmentsEnabled: boolean;
  invalidatingEvent: boolean;
  targetLossMinKg: number;
  targetLossMaxKg: number;
};

// The §6.1 decision shape. When proposing, `deltaKcal` is the signed daily change (negative
// for a reduction, positive for an increase) and `proposedTargetCalories` is the resulting
// target; both are null otherwise. `professionalReviewRequired` is true only when a
// reduction was clamped by the safety floor.
export type CalorieAdjustmentDecision = {
  decision: CalorieDecisionCode;
  deltaKcal: number | null;
  proposedTargetCalories: number | null;
  professionalReviewRequired: boolean;
  reasons: CalorieReason[];
  inputs: CalorieAdjustmentInputs;
  ruleVersion: string;
  nextAction: string;
};

// Evaluate the calorie-adjustment eligibility for one period (docs/06 §6.7). Pure: it reads
// only its inputs and returns a proposal or an honest not-eligible/no-change result. It
// never applies anything and never breaches the safety floor.
export function evaluateCalorieAdjustment(
  input: CalorieAdjustmentInput,
): CalorieAdjustmentDecision {
  const invalidatingEvent = input.invalidatingEvent === true;
  const trend = input.weightTrend;
  const changePerWeekKg =
    trend.status === 'trend' ? trend.changePerWeekKg : null;
  // A positive loss means weight is falling. changePerWeekKg is signed (negative = falling),
  // so loss = -changePerWeekKg. Null when the trend is insufficient.
  const lossPerWeekKg = changePerWeekKg === null ? null : -changePerWeekKg;

  const inputs: CalorieAdjustmentInputs = {
    adaptiveAdjustmentsEnabled: input.adaptiveAdjustmentsEnabled,
    adherencePercent: input.adherencePercent,
    calorieFloor: input.calorieFloor,
    changePerWeekKg,
    currentTargetCalories: input.currentTarget?.calories ?? null,
    daysSinceTargetBegan: input.daysSinceTargetBegan,
    invalidatingEvent,
    lossPerWeekKg,
    minDaysSinceTarget: MIN_DAYS_SINCE_TARGET,
    minNutritionDays: MIN_NUTRITION_DAYS,
    nutritionLoggedDayCount: input.nutritionLoggedDayCount,
    nutritionWindowDays: NUTRITION_WINDOW_DAYS,
    targetLossMaxKg: TARGET_LOSS_MAX_KG,
    targetLossMinKg: TARGET_LOSS_MIN_KG,
    weightTrendStatus: trend.status,
  };

  const build = (
    decision: CalorieDecisionCode,
    deltaKcal: number | null,
    proposedTargetCalories: number | null,
    professionalReviewRequired: boolean,
    reasons: CalorieReason[],
    nextAction: string,
  ): CalorieAdjustmentDecision => ({
    decision,
    deltaKcal,
    inputs,
    nextAction,
    professionalReviewRequired,
    proposedTargetCalories,
    reasons,
    ruleVersion: RULE_VERSION,
  });

  // === ELIGIBILITY GATE FIRST (docs/06 §6.7 "Data sufficiency") ===============
  // ALL must hold, or the result is not-eligible with the unmet reason and, crucially, NO
  // calorie change. Every gate is fail-safe: a missing/unknown input a gate needs counts as
  // unmet. The gates are collected together so a not-eligible result can explain every
  // reason it failed, not just the first.
  const notEligibleReasons: CalorieReason[] = [];

  // The user disabled adaptive adjustments (§6.7). No change regardless of data.
  if (input.adaptiveAdjustmentsEnabled !== true) {
    notEligibleReasons.push({
      code: 'adaptive-adjustments-disabled',
      message:
        'Adaptive calorie adjustments are switched off, so no change is suggested. You can turn them on whenever you like.',
    });
  }

  // An invalidating illness/travel/unusual event over the period (§6.7).
  if (invalidatingEvent) {
    notEligibleReasons.push({
      code: 'invalidating-event',
      message:
        'This period was flagged as unusual (for example illness or travel), so it is not used to change your target.',
    });
  }

  // At least fourteen days since the current target began (§6.7). A missing target or an
  // unknown age fails the gate.
  if (input.currentTarget === null) {
    notEligibleReasons.push({
      code: 'no-current-target',
      message:
        'There is no current calorie target to adjust yet, so set one first and give it a couple of weeks.',
    });
  } else if (
    input.daysSinceTargetBegan === null ||
    input.daysSinceTargetBegan < MIN_DAYS_SINCE_TARGET
  ) {
    notEligibleReasons.push({
      code: 'target-too-recent',
      message: `Your current target needs at least ${MIN_DAYS_SINCE_TARGET} days to settle before any change is suggested.`,
    });
  }

  // Weight logging meets the trend engine's own sufficiency (§6.7, reusing roadmap 18). An
  // insufficient-data trend fails the gate — no trend, no change.
  if (trend.status !== 'trend') {
    notEligibleReasons.push({
      code: 'insufficient-weight-data',
      message:
        'There are not enough recent weigh-ins to read a reliable trend, so no calorie change is suggested. Keep logging your weight.',
    });
  }

  // Nutrition logged on at least ten of the last fourteen LOCAL days (§6.7). Insufficient
  // logging must prevent any change — the non-negotiable property.
  if (input.nutritionLoggedDayCount < MIN_NUTRITION_DAYS) {
    notEligibleReasons.push({
      code: 'insufficient-nutrition-logging',
      message: `Nutrition was logged on ${input.nutritionLoggedDayCount} of the last ${NUTRITION_WINDOW_DAYS} days; at least ${MIN_NUTRITION_DAYS} are needed before a calorie change is suggested.`,
    });
  }

  if (notEligibleReasons.length > 0) {
    return build(
      'not-eligible',
      null,
      null,
      false,
      notEligibleReasons,
      'No change to your calorie target. Keep logging, and a suggestion will appear once there is enough to go on.',
    );
  }

  // === ADJUSTMENT RULES (docs/06 §6.7) ========================================
  // Every gate passed, so `lossPerWeekKg`, `currentTarget` and `daysSinceTargetBegan` are all
  // known (the trend is 'trend'). TypeScript still needs the narrowing, and it is a genuine
  // invariant of the gates above.
  const loss = lossPerWeekKg as number;
  const target = input.currentTarget as CurrentTarget;
  const adherence = input.adherencePercent;
  const adherenceMet = adherence !== null && adherence >= ADHERENCE_MIN_PERCENT;

  // Loss within the desired band → no change (§6.7). Checked first: a healthy rate is left
  // alone.
  if (loss >= TARGET_LOSS_MIN_KG && loss <= TARGET_LOSS_MAX_KG) {
    return build(
      'no-change',
      null,
      null,
      false,
      [
        {
          code: 'loss-within-range',
          message: `Weight is trending down at about ${formatRate(
            loss,
          )} kg per week, comfortably within the ${TARGET_LOSS_MIN_KG}–${TARGET_LOSS_MAX_KG} kg target, so keep the current target.`,
        },
      ],
      'No change needed — your current target is working. Keep going.',
    );
  }

  // Loss exceeds 0.8 kg/week → propose an increase, with a review-logging note (§6.7).
  // Adherence is not required for this branch. A very fast loss can also reflect
  // under-logging, so the honest recommendation pairs the increase with that caveat.
  if (loss > RAPID_LOSS_THRESHOLD_KG) {
    const proposedTarget = target.calories + ADJUSTMENT_STEP_KCAL;
    return build(
      'propose-increase',
      ADJUSTMENT_STEP_KCAL,
      proposedTarget,
      false,
      [
        {
          code: 'loss-too-rapid',
          message: `Weight is falling quickly, at about ${formatRate(
            loss,
          )} kg per week — faster than the ${TARGET_LOSS_MAX_KG} kg upper target — so consider adding about ${ADJUSTMENT_STEP_KCAL} kcal a day.`,
        },
        {
          code: 'review-logging-accuracy',
          message:
            'It is also worth checking your food logging is complete, as a very fast drop can sometimes mean some intake was missed.',
        },
      ],
      `Review the suggested increase to about ${proposedTarget} kcal a day, or double-check your logging. Nothing changes until you accept it.`,
    );
  }

  // Loss below 0.1 kg/week (including weight increasing) AND adherence >= 80% → propose a
  // reduction (§6.7). This covers both the "loss below 0.1" and the "weight increasing"
  // rules, which both propose a reduction; the reason distinguishes them. Adherence below
  // 80% is NOT eligible for a reduction (the rule requires >= 80%): with low loss and low
  // adherence the honest read is that logging/consistency is the lever, not the target.
  if (loss < LOW_LOSS_THRESHOLD_KG) {
    if (!adherenceMet) {
      return build(
        'no-change',
        null,
        null,
        false,
        [
          {
            code: 'adherence-below-threshold',
            message:
              adherence === null
                ? 'Weight change has been small, but there is no session adherence to read yet, so the target is left unchanged for now.'
                : `Weight change has been small, but session adherence was ${adherence}% (below ${ADHERENCE_MIN_PERCENT}%), so the target is left unchanged — building consistency comes first.`,
          },
        ],
        'No change for now. Aim for steady logging and sessions, and a suggestion may follow.',
      );
    }
    return proposeReduction({
      build,
      calorieFloor: input.calorieFloor,
      increasing: changePerWeekKg !== null && changePerWeekKg > 0,
      target,
    });
  }

  // Anything else (loss between 0.1 and 0.2, or between 0.6 and 0.8) is outside the target
  // band but triggers no adjustment rule — the safe default is no change.
  return build(
    'no-change',
    null,
    null,
    false,
    [
      {
        code: 'no-rule-triggered',
        message: `Weight is trending at about ${formatRate(
          loss,
        )} kg per week. That is close to the ${TARGET_LOSS_MIN_KG}–${TARGET_LOSS_MAX_KG} kg target and does not meet any adjustment rule, so keep the current target.`,
      },
    ],
    'No change needed right now. Keep logging and check again next week.',
  );
}

// Build a reduction proposal, clamped by the safety floor. Never breaches the floor: if the
// stepped target would fall below it, the resulting target is clamped UP to the floor, the
// delta is reduced to match, and a professional-review note is attached (docs/06 §6.7 "Never
// propose a target below a configured safety floor without professional review"). When the
// current target already sits at or below the floor, the delta is zero (no room to reduce)
// and the note makes clear a professional should be consulted before going lower.
function proposeReduction(args: {
  build: (
    decision: CalorieDecisionCode,
    deltaKcal: number | null,
    proposedTargetCalories: number | null,
    professionalReviewRequired: boolean,
    reasons: CalorieReason[],
    nextAction: string,
  ) => CalorieAdjustmentDecision;
  target: CurrentTarget;
  increasing: boolean;
  calorieFloor: number;
}): CalorieAdjustmentDecision {
  const { build, calorieFloor, increasing, target } = args;
  const desiredTarget = target.calories - ADJUSTMENT_STEP_KCAL;
  const floored = Math.max(desiredTarget, calorieFloor);
  const professionalReviewRequired = desiredTarget < calorieFloor;
  // The actual delta after clamping (<= 0). Zero when already at/below the floor.
  const deltaKcal = floored - target.calories;

  const reasons: CalorieReason[] = [
    increasing
      ? {
          code: 'weight-increasing',
          message: `Weight has been edging up while adherence is good, so consider trimming about ${ADJUSTMENT_STEP_KCAL} kcal a day.`,
        }
      : {
          code: 'loss-stalled',
          message: `Weight loss has stalled at under ${LOW_LOSS_THRESHOLD_KG} kg per week while adherence is good, so consider trimming about ${ADJUSTMENT_STEP_KCAL} kcal a day.`,
        },
  ];

  if (professionalReviewRequired) {
    reasons.push({
      code: 'floor-reached',
      message: `A full reduction would take the target below your ${calorieFloor} kcal floor, so it is held at the floor. Please seek professional advice before going any lower.`,
    });
    return build(
      'propose-reduction',
      deltaKcal,
      floored,
      true,
      reasons,
      `Review the suggested target of about ${floored} kcal a day (held at your safety floor). Consider professional advice before reducing further, and nothing changes until you accept it.`,
    );
  }

  return build(
    'propose-reduction',
    deltaKcal,
    floored,
    false,
    reasons,
    `Review the suggested reduction to about ${floored} kcal a day. Nothing changes until you accept it.`,
  );
}

// Format a kg/week rate to one decimal place for the British-English reasons. Kept local so
// the numbers in the copy match what a reader expects (e.g. "0.4 kg per week").
function formatRate(kgPerWeek: number): string {
  return (Math.round(Math.abs(kgPerWeek) * 10) / 10).toFixed(1);
}
