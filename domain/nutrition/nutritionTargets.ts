// Pure nutrition-target helpers for the Today screen. No React and no I/O, so
// they unit-test in isolation (mirrors domain/training/planSchedule.ts).
//
// nutrition_targets are effective-dated and kept as history rather than
// overwritten (docs/05 §5.7), so "the current target" is a calculation, not a
// single row: it is the most recent target that has already taken effect.

export type NutritionTarget = {
  calories: number;
  effectiveFrom: string;
  proteinG: number;
};

// The current target is the one with the latest effective_from that is on or
// before today. Future-dated targets are ignored until they take effect. Returns
// null when no target applies yet, so the UI shows "no target set" rather than a
// fabricated zero. ISO YYYY-MM-DD dates compare correctly as strings.
export function resolveCurrentNutritionTarget(
  targets: readonly NutritionTarget[],
  todayIso: string,
): NutritionTarget | null {
  let current: NutritionTarget | null = null;
  for (const target of targets) {
    if (target.effectiveFrom <= todayIso) {
      if (!current || target.effectiveFrom > current.effectiveFrom) {
        current = target;
      }
    }
  }
  return current;
}

export type NutrientProgress = {
  consumed: number;
  percent: number;
  remaining: number;
  target: number;
};

// Progress of a logged amount against a daily target. Consumed is clamped at zero
// and remaining never falls below zero for display; percent is a whole number in
// 0–100. This is the calorie/protein "remaining" calculation the Today screen and
// the later food-logging roadmap item share; until logging exists there is no
// intake source, so Today renders the target alone rather than calling this with a
// fake zero (see features/today).
export function computeNutrientProgress(
  target: number,
  consumed: number,
): NutrientProgress {
  const safeConsumed = Math.max(0, consumed);
  const remaining = Math.max(0, target - safeConsumed);
  const percent =
    target > 0 ? Math.min(100, Math.round((safeConsumed / target) * 100)) : 0;
  return { consumed: safeConsumed, percent, remaining, target };
}
