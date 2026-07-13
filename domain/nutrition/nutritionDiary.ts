// Pure daily-diary helpers for food logging (docs/03 S-031, docs/05 §5.7). No React
// and no I/O, so they unit-test in isolation (mirrors domain/nutrition/nutritionTargets.ts
// and domain/measurements/weightTrend.ts).
//
// Two responsibilities, both pure:
//   1. scaleMacros — turn a food's (or template item's) PER-SERVING macros and a
//      serving quantity into the FINAL consumed macros that a nutrition_logs row
//      stores. The scaling happens once, at log time; the stored row then holds the
//      actual consumed values, so daily totals are a plain sum with no re-scaling.
//   2. summariseDiary — group logged entries by meal and total them for the day.
//
// Calories are integers throughout (docs/06, AGENTS.md "integer values for calories"):
// scaling rounds to a whole calorie and the daily total is an exact integer sum with no
// floating-point drift. Protein is grams to two decimal places (the numeric(6,2)
// column), rounded once at each boundary so a long day of entries never accumulates
// binary-floating-point error.

// The four meals the diary groups by (docs/03 S-031), in display order.
export const MEAL_TYPES = ['breakfast', 'lunch', 'dinner', 'snacks'] as const;
export type MealType = (typeof MEAL_TYPES)[number];

export function isMealType(value: string): value is MealType {
  return (MEAL_TYPES as readonly string[]).includes(value);
}

// Macros as a food or template item stores them, per single serving. Carbohydrate and
// fat are optional (docs/03 S-032 "Optional carbohydrate and fat").
export type Macros = {
  calories: number;
  proteinG: number;
  carbohydrateG?: number | null;
  fatG?: number | null;
};

// Round grams to two decimal places (the numeric(6,2) precision), avoiding the
// 0.1 + 0.2 kind of binary drift by rounding at every boundary.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// Scale per-serving macros by a serving quantity into the final consumed macros a log
// row records. Calories round to a whole number; grams to two decimal places. A null
// carbohydrate/fat stays null (unknown scaled is still unknown, never a fabricated 0).
export function scaleMacros(
  perServing: Macros,
  servingQuantity: number,
): Macros {
  const scaleGrams = (value: number | null | undefined): number | null =>
    value === null || value === undefined
      ? null
      : round2(value * servingQuantity);
  return {
    calories: Math.round(perServing.calories * servingQuantity),
    carbohydrateG: scaleGrams(perServing.carbohydrateG),
    fatG: scaleGrams(perServing.fatG),
    proteinG: round2(perServing.proteinG * servingQuantity),
  };
}

// One logged entry as the diary reads it: the already-scaled, final consumed macros for
// a single nutrition_logs row, plus which meal it belongs to.
export type DiaryEntry = {
  id: string;
  mealType: MealType;
  description: string;
  calories: number;
  proteinG: number;
};

export type MealSummary = {
  mealType: MealType;
  entries: DiaryEntry[];
  calories: number;
  proteinG: number;
};

export type DiaryTotals = {
  calories: number;
  proteinG: number;
};

export type DiarySummary = {
  meals: MealSummary[];
  totals: DiaryTotals;
};

// Group the day's entries by meal (in canonical order) and total them. Only meals that
// have at least one entry appear. Calories sum as exact integers; protein is rounded to
// two decimals after summing. An empty day yields no meals and zero totals.
export function summariseDiary(entries: readonly DiaryEntry[]): DiarySummary {
  const meals: MealSummary[] = [];
  let totalCalories = 0;
  let totalProtein = 0;

  for (const mealType of MEAL_TYPES) {
    const mealEntries = entries.filter((entry) => entry.mealType === mealType);
    if (mealEntries.length === 0) {
      continue;
    }
    let calories = 0;
    let protein = 0;
    for (const entry of mealEntries) {
      calories += entry.calories;
      protein += entry.proteinG;
    }
    meals.push({
      calories,
      entries: mealEntries,
      mealType,
      proteinG: round2(protein),
    });
    totalCalories += calories;
    totalProtein += protein;
  }

  return {
    meals,
    totals: { calories: totalCalories, proteinG: round2(totalProtein) },
  };
}
