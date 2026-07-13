// Validation for the alcohol logging forms (docs/03 S-033: the drink log and the reusable
// drink favourite), kept out of the components so it can be reused and unit tested
// (mirrors features/nutrition/nutritionSchema.ts and features/measurements). British
// English throughout.
//
// TONE (docs/07 §7.4, the roadmap-20 brief): a drink is NEUTRAL data. No message here is
// shame-based, moralising or corrective — the messages state what a valid entry needs, and
// nothing more.
//
// This is a plain owner-scoped logging feature: alcohol has no safety rule a client could
// violate by logging (unlike readiness's trusted classifier or the red session-start
// block), so validation here IS the boundary that keeps malformed numbers out. The bounds
// mirror the column constraints so a valid form can never fail a check: volume_ml > 0
// (numeric(8,2)), abv_percent 0–100 (numeric(5,2)), calories a non-negative integer, and
// units are DERIVED (never entered) via the pure computeUnits.

import { z } from 'zod';

import { computeUnits } from '@/domain/alcohol/alcoholUnits';

// Column-aligned bounds, named once. The volume/ABV ceilings reject a mistyped figure
// while staying well inside the numeric columns.
export const VOLUME_ML_MAX = 5000; // a generous per-drink ceiling (e.g. a large jug).
export const ABV_MIN = 0;
export const ABV_MAX = 100;
export const DRINK_CALORIE_MAX = 5000; // a generous per-drink ceiling, well inside integer.
export const MAX_DRINK_NAME_LENGTH = 120;
export const MAX_DRINK_TYPE_LENGTH = 60;
export const MAX_NOTE_LENGTH = 500;
export const WEEKLY_LIMIT_UNITS_MAX = 200; // a generous personal-limit ceiling.

// volume/units carry at most two decimals (numeric(8,2) / numeric(6,2)); ABV two decimals
// (numeric(5,2)).
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

function collectErrors<T extends string>(
  error: z.ZodError,
): Partial<Record<T, string>> {
  const errors: Partial<Record<T, string>> = {};
  for (const issue of error.issues) {
    const field = issue.path[0] as T | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return errors;
}

// ---- Drink log (S-033: record a drink into the diary) ----------------------

// What the form collects. `volumeMl`, `abvPercent` and `calories` start null (nothing
// typed yet); `loggedAt` defaults to now but is editable so a drink can be back-dated.
export type DrinkLogDraft = {
  drinkName: string;
  drinkType?: string | undefined;
  volumeMl: number | null;
  abvPercent: number | null;
  calories: number | null;
  occasionNote?: string | undefined;
  loggedAt: Date;
};

// A validated, ready-to-insert drink log. `units` is COMPUTED here from volume and ABV
// (docs/06 §6.9) — the form never enters it directly.
export type ValidatedDrinkLog = {
  drinkName: string;
  drinkType: string | null;
  volumeMl: number;
  abvPercent: number;
  calories: number;
  units: number;
  occasionNote: string | null;
  loggedAtIso: string;
};

export type DrinkLogFieldErrors = Partial<
  Record<
    | 'drinkName'
    | 'drinkType'
    | 'volumeMl'
    | 'abvPercent'
    | 'calories'
    | 'occasionNote'
    | 'loggedAt',
    string
  >
>;

export type DrinkLogValidation =
  | { success: true; data: ValidatedDrinkLog }
  | { success: false; errors: DrinkLogFieldErrors };

const volumeField = z
  .number({ message: 'Enter the volume in millilitres.' })
  .positive('The volume must be greater than zero.')
  .max(VOLUME_ML_MAX, `Keep the volume at or below ${VOLUME_ML_MAX} ml.`)
  .refine(hasAtMostTwoDecimals, {
    message: 'Enter the volume to at most two decimal places.',
  });

const abvField = z
  .number({ message: 'Enter the ABV as a percentage.' })
  .min(ABV_MIN, 'The ABV cannot be negative.')
  .max(ABV_MAX, `The ABV must be at most ${ABV_MAX}%.`)
  .refine(hasAtMostTwoDecimals, {
    message: 'Enter the ABV to at most two decimal places.',
  });

const drinkCaloriesField = z
  .number({ message: 'Enter the calories as a whole number.' })
  .int('Enter the calories as a whole number.')
  .min(0, 'Calories cannot be negative.')
  .max(DRINK_CALORIE_MAX, `Keep calories at or below ${DRINK_CALORIE_MAX}.`);

const drinkNameField = z
  .string()
  .trim()
  .min(1, 'Give this drink a name.')
  .max(
    MAX_DRINK_NAME_LENGTH,
    `Keep the name under ${MAX_DRINK_NAME_LENGTH} characters.`,
  );

const drinkTypeField = z
  .string()
  .trim()
  .max(
    MAX_DRINK_TYPE_LENGTH,
    `Keep the type under ${MAX_DRINK_TYPE_LENGTH} characters.`,
  )
  .optional();

function drinkLogSchema(now: Date) {
  return z.object({
    abvPercent: abvField,
    calories: drinkCaloriesField,
    drinkName: drinkNameField,
    drinkType: drinkTypeField,
    loggedAt: z
      .date({ message: 'Choose when you had this.' })
      .refine(
        (date) => date.getTime() <= now.getTime(),
        'The time cannot be in the future.',
      ),
    occasionNote: z
      .string()
      .trim()
      .max(
        MAX_NOTE_LENGTH,
        `Keep the note under ${MAX_NOTE_LENGTH} characters.`,
      )
      .optional(),
    volumeMl: volumeField,
  });
}

export function validateDrinkLog(
  draft: DrinkLogDraft,
  now: Date = new Date(),
): DrinkLogValidation {
  const parsed = drinkLogSchema(now).safeParse(draft);
  if (!parsed.success) {
    return {
      errors: collectErrors<keyof DrinkLogFieldErrors>(parsed.error),
      success: false,
    };
  }
  const type = parsed.data.drinkType?.trim();
  const note = parsed.data.occasionNote?.trim();
  return {
    data: {
      abvPercent: parsed.data.abvPercent,
      calories: parsed.data.calories,
      drinkName: parsed.data.drinkName,
      drinkType: type ? type : null,
      loggedAtIso: parsed.data.loggedAt.toISOString(),
      occasionNote: note ? note : null,
      // Units are derived, never entered (docs/06 §6.9).
      units: computeUnits(parsed.data.volumeMl, parsed.data.abvPercent),
      volumeMl: parsed.data.volumeMl,
    },
    success: true,
  };
}

// ---- Drink favourite (a reusable drink definition, the foods parallel) ------

export type DrinkFavouriteDraft = {
  drinkName: string;
  drinkType?: string | undefined;
  volumeMl: number | null;
  abvPercent: number | null;
  calories: number | null;
};

export type ValidatedDrinkFavourite = {
  drinkName: string;
  drinkType: string | null;
  volumeMl: number;
  abvPercent: number;
  calories: number;
};

export type DrinkFavouriteFieldErrors = Partial<
  Record<
    'drinkName' | 'drinkType' | 'volumeMl' | 'abvPercent' | 'calories',
    string
  >
>;

export type DrinkFavouriteValidation =
  | { success: true; data: ValidatedDrinkFavourite }
  | { success: false; errors: DrinkFavouriteFieldErrors };

const drinkFavouriteSchema = z.object({
  abvPercent: abvField,
  calories: drinkCaloriesField,
  drinkName: drinkNameField,
  drinkType: drinkTypeField,
  volumeMl: volumeField,
});

export function validateDrinkFavourite(
  draft: DrinkFavouriteDraft,
): DrinkFavouriteValidation {
  const parsed = drinkFavouriteSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      errors: collectErrors<keyof DrinkFavouriteFieldErrors>(parsed.error),
      success: false,
    };
  }
  const type = parsed.data.drinkType?.trim();
  return {
    data: {
      abvPercent: parsed.data.abvPercent,
      calories: parsed.data.calories,
      drinkName: parsed.data.drinkName,
      drinkType: type ? type : null,
      volumeMl: parsed.data.volumeMl,
    },
    success: true,
  };
}

// ---- Personal weekly unit limit (docs/06 §6.9, docs/07 §7.4) ----------------

export type WeeklyLimitDraft = { units: number | null };

export type WeeklyLimitValidation =
  | { success: true; data: { units: number } }
  | { success: false; error: string };

// A personal limit is a positive number of units. There is deliberately NO default and no
// suggested value — the user chooses it (or leaves it unset, in which case the
// percentage-of-limit metric is simply not shown).
export function validateWeeklyLimit(
  draft: WeeklyLimitDraft,
): WeeklyLimitValidation {
  const schema = z
    .number({ message: 'Enter your weekly limit in units.' })
    .positive('The weekly limit must be greater than zero.')
    .max(
      WEEKLY_LIMIT_UNITS_MAX,
      `The weekly limit must be at most ${WEEKLY_LIMIT_UNITS_MAX} units.`,
    )
    .refine(hasAtMostTwoDecimals, {
      message: 'Enter the weekly limit to at most two decimal places.',
    });
  const parsed = schema.safeParse(draft.units);
  if (!parsed.success) {
    return {
      error: parsed.error.issues[0]?.message ?? 'Enter a valid weekly limit.',
      success: false,
    };
  }
  return { data: { units: parsed.data }, success: true };
}
