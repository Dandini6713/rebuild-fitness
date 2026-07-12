// Derived, presentation-facing summaries for onboarding. Pure functions, kept
// out of the components. Nothing here calculates or implies medical fitness:
// the Achilles helper only chooses gentler general-fitness options and never
// judges whether the tendon is healed (docs/07).

import {
  ACHILLES_SYMPTOM_LABELS,
  AchillesData,
  CALF_RAISE_CAPABILITY_LABELS,
  GoalsData,
  OBJECTIVE_LABELS,
  PROGRESS_RATE_KG_PER_WEEK,
  PROGRESS_RATE_LABELS,
  WALKING_TOLERANCE_LABELS,
} from './onboardingModel';

export type WeightDirection = 'loss' | 'gain' | 'maintain';

export type WeightPlan = {
  deltaKg: number;
  direction: WeightDirection;
  estimatedWeeks: number | null;
  summary: string;
};

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

export function deriveWeightPlan(goals: GoalsData): WeightPlan {
  const deltaKg = roundTo(goals.targetWeightKg - goals.currentWeightKg, 1);
  const magnitude = Math.abs(deltaKg);
  const direction: WeightDirection =
    deltaKg <= -0.1 ? 'loss' : deltaKg >= 0.1 ? 'gain' : 'maintain';

  if (direction === 'maintain') {
    return {
      deltaKg,
      direction,
      estimatedWeeks: null,
      summary: 'You would like to hold roughly your current weight.',
    };
  }

  const perWeek = PROGRESS_RATE_KG_PER_WEEK[goals.preferredRate];
  const estimatedWeeks = Math.ceil(magnitude / perWeek);
  const directionWord = direction === 'loss' ? 'to lose' : 'to gain';

  return {
    deltaKg,
    direction,
    estimatedWeeks,
    summary: `About ${magnitude.toFixed(1)} kg ${directionWord}. At a ${PROGRESS_RATE_LABELS[
      goals.preferredRate
    ].toLowerCase()}, that is roughly ${estimatedWeeks} weeks. This is an estimate, not a promise.`,
  };
}

export function describeObjective(goals: GoalsData): string {
  return OBJECTIVE_LABELS[goals.mainObjective];
}

export type AchillesCaution = {
  conservativeStart: boolean;
  reasons: string[];
};

// Picks whether the plan should open with more cautious general-fitness options.
// It reports the self-reported inputs behind the choice; it does not diagnose.
export function deriveAchillesCaution(achilles: AchillesData): AchillesCaution {
  const reasons: string[] = [];

  if (
    achilles.painStiffness === 'moderate' ||
    achilles.painStiffness === 'significant'
  ) {
    reasons.push(
      `You reported ${ACHILLES_SYMPTOM_LABELS[achilles.painStiffness].toLowerCase()}.`,
    );
  }
  if (achilles.walkingTolerance === 'limited') {
    reasons.push(
      `Walking is ${WALKING_TOLERANCE_LABELS[achilles.walkingTolerance].toLowerCase()}.`,
    );
  }
  if (achilles.calfRaiseCapability !== 'comfortable') {
    reasons.push(
      `Single-leg calf raises are ${CALF_RAISE_CAPABILITY_LABELS[
        achilles.calfRaiseCapability
      ].toLowerCase()}.`,
    );
  }

  return { conservativeStart: reasons.length > 0, reasons };
}
