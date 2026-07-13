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

// A day window [startIso, endIso] of UTC instants covering the user's LOCAL calendar
// day `dayIso` (YYYY-MM-DD). nutrition_logs.logged_at is stored in UTC, but `dayIso` is
// derived from the device's LOCAL date (toIsoDate), so a raw `${dayIso}T00:00:00Z` window
// disagrees with the user's day by their UTC offset. In BST (UTC+1) that left a one-hour
// gap: a log at 00:30 local time is after the previous UTC day's end and before the
// current UTC day's start, so it fell into NEITHER day — silent data loss. This computes
// the UTC instants of local-midnight-to-local-midnight instead, so adjacent days abut
// exactly with no gap and no overlap, and the window is exactly the day the user is
// living in (AGENTS.md: display in the user's time zone).
//
// `offsetMinutes` follows Date.getTimezoneOffset(): the minutes to ADD to local time to
// reach UTC (e.g. -60 for BST, UTC+1; +300 for EST, UTC-5). It is passed in, never read
// from ambient state, so the window stays pure and testable at any offset. A fuller
// multi-timezone/travel story (a user changing zones mid-history) remains a noted seam;
// same-zone local-day correctness is handled.
export function dayWindow(
  dayIso: string,
  offsetMinutes: number,
): { startIso: string; endIso: string } {
  const parts = dayIso.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const dayMs = 24 * 60 * 60 * 1000;
  const localMidnightUtcMs =
    Date.UTC(year, month - 1, day) + offsetMinutes * 60_000;
  return {
    // The last millisecond before the next local midnight, so `.lte(endIso)` includes
    // the whole local day without overlapping the following one.
    endIso: new Date(localMidnightUtcMs + dayMs - 1).toISOString(),
    startIso: new Date(localMidnightUtcMs).toISOString(),
  };
}

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
