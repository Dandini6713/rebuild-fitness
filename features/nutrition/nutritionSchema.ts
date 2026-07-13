// Validation for the nutrition logging forms (docs/03 S-031, S-032, and the target and
// meal-template forms), kept out of the components so it can be reused and unit tested
// (mirrors features/measurements/measurementSchema.ts).
//
// This is a plain owner-scoped logging feature: nutrition has no safety rule a client
// could violate by logging (unlike readiness's trusted classifier or the red
// session-start block), so validation here IS the boundary that keeps malformed numbers
// out of the database. The bounds mirror the column constraints so a valid form can
// never fail a check: nutrition_targets.calories between 1000 and 6000, protein_g
// between 0 and 400 (20260711090300); calories and grams are non-negative elsewhere;
// calories are integers and grams carry at most two decimal places (numeric(6,2)).
// British English throughout; no shame-based or appearance-insulting copy (docs/07).

import { z } from 'zod';

import { isMealType, type MealType } from '@/domain/nutrition/nutritionDiary';

// Column-aligned bounds, named once.
export const CALORIE_MAX = 10000; // a generous per-item ceiling, well inside integer.
export const GRAMS_MAX = 1000; // a generous per-item macro ceiling.
export const TARGET_CALORIE_MIN = 1000;
export const TARGET_CALORIE_MAX = 6000;
export const TARGET_PROTEIN_MAX = 400;
export const MAX_NAME_LENGTH = 120;
export const MAX_DESCRIPTION_LENGTH = 200;
export const MAX_TEMPLATE_ITEMS = 40;

// numeric(6,2) stores at most two decimal places.
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

// A required integer calorie count in [0, max].
function calorieField(max: number = CALORIE_MAX) {
  return z
    .number({ message: 'Enter the calories as a whole number.' })
    .int('Enter the calories as a whole number.')
    .min(0, 'Calories cannot be negative.')
    .max(max, `Keep calories at or below ${max}.`);
}

// A required gram amount in [0, max] with at most two decimals.
function gramsField(label: string, max: number = GRAMS_MAX) {
  return z
    .number({ message: `Enter the ${label} in grams.` })
    .min(0, `${label} cannot be negative.`)
    .max(max, `Keep ${label} at or below ${max} g.`)
    .refine(hasAtMostTwoDecimals, {
      message: `Enter the ${label} to at most two decimal places.`,
    });
}

// An optional gram amount: undefined/null means "not recorded" (carbohydrate and fat
// are optional in docs/03 S-032), never coerced to zero.
function optionalGramsField(label: string) {
  return z
    .number()
    .min(0, `${label} cannot be negative.`)
    .max(GRAMS_MAX, `Keep ${label} at or below ${GRAMS_MAX} g.`)
    .refine(hasAtMostTwoDecimals, {
      message: `Enter the ${label} to at most two decimal places.`,
    })
    .nullish();
}

// ---- Food (S-032: add or edit a saved food) --------------------------------

export type FoodDraft = {
  name: string;
  servingDescription?: string | undefined;
  calories: number | null;
  proteinG: number | null;
  carbohydrateG?: number | null | undefined;
  fatG?: number | null | undefined;
  favourite?: boolean | undefined;
};

export type ValidatedFood = {
  name: string;
  servingDescription: string | null;
  calories: number;
  proteinG: number;
  carbohydrateG: number | null;
  fatG: number | null;
  favourite: boolean;
};

export type FoodFieldErrors = Partial<
  Record<
    | 'name'
    | 'servingDescription'
    | 'calories'
    | 'proteinG'
    | 'carbohydrateG'
    | 'fatG',
    string
  >
>;

export type FoodValidation =
  | { success: true; data: ValidatedFood }
  | { success: false; errors: FoodFieldErrors };

const foodSchema = z.object({
  calories: calorieField(),
  carbohydrateG: optionalGramsField('carbohydrate'),
  fatG: optionalGramsField('fat'),
  favourite: z.boolean().optional(),
  name: z
    .string()
    .trim()
    .min(1, 'Give this food a name.')
    .max(MAX_NAME_LENGTH, `Keep the name under ${MAX_NAME_LENGTH} characters.`),
  proteinG: gramsField('protein'),
  servingDescription: z
    .string()
    .trim()
    .max(
      MAX_DESCRIPTION_LENGTH,
      `Keep the serving under ${MAX_DESCRIPTION_LENGTH} characters.`,
    )
    .optional(),
});

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

export function validateFood(draft: FoodDraft): FoodValidation {
  const parsed = foodSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      errors: collectErrors<keyof FoodFieldErrors>(parsed.error),
      success: false,
    };
  }
  const serving = parsed.data.servingDescription?.trim();
  return {
    data: {
      calories: parsed.data.calories,
      carbohydrateG: parsed.data.carbohydrateG ?? null,
      fatG: parsed.data.fatG ?? null,
      favourite: parsed.data.favourite ?? false,
      name: parsed.data.name,
      proteinG: parsed.data.proteinG,
      servingDescription: serving ? serving : null,
    },
    success: true,
  };
}

// ---- Quick entry (S-031: quick calories and protein, straight into the diary) -----

export type QuickEntryDraft = {
  description: string;
  mealType: string;
  calories: number | null;
  proteinG: number | null;
  carbohydrateG?: number | null | undefined;
  fatG?: number | null | undefined;
  loggedAt: Date;
};

export type ValidatedQuickEntry = {
  description: string;
  mealType: MealType;
  calories: number;
  proteinG: number;
  carbohydrateG: number | null;
  fatG: number | null;
  loggedAtIso: string;
};

export type QuickEntryFieldErrors = Partial<
  Record<
    | 'description'
    | 'mealType'
    | 'calories'
    | 'proteinG'
    | 'carbohydrateG'
    | 'fatG'
    | 'loggedAt',
    string
  >
>;

export type QuickEntryValidation =
  | { success: true; data: ValidatedQuickEntry }
  | { success: false; errors: QuickEntryFieldErrors };

function quickEntrySchema(now: Date) {
  return z.object({
    calories: calorieField(),
    carbohydrateG: optionalGramsField('carbohydrate'),
    description: z
      .string()
      .trim()
      .min(1, 'Give this entry a name.')
      .max(
        MAX_DESCRIPTION_LENGTH,
        `Keep the name under ${MAX_DESCRIPTION_LENGTH} characters.`,
      ),
    fatG: optionalGramsField('fat'),
    loggedAt: z
      .date({ message: 'Choose when you had this.' })
      .refine(
        (date) => date.getTime() <= now.getTime(),
        'The time cannot be in the future.',
      ),
    mealType: z.string().refine((value) => isMealType(value), 'Choose a meal.'),
    proteinG: gramsField('protein'),
  });
}

export function validateQuickEntry(
  draft: QuickEntryDraft,
  now: Date = new Date(),
): QuickEntryValidation {
  const parsed = quickEntrySchema(now).safeParse(draft);
  if (!parsed.success) {
    return {
      errors: collectErrors<keyof QuickEntryFieldErrors>(parsed.error),
      success: false,
    };
  }
  return {
    data: {
      calories: parsed.data.calories,
      carbohydrateG: parsed.data.carbohydrateG ?? null,
      description: parsed.data.description,
      fatG: parsed.data.fatG ?? null,
      loggedAtIso: parsed.data.loggedAt.toISOString(),
      mealType: parsed.data.mealType as MealType,
      proteinG: parsed.data.proteinG,
    },
    success: true,
  };
}

// ---- Effective-dated target (docs/05 §5.7, docs/06 §6.8) --------------------

export type TargetDraft = {
  calories: number | null;
  proteinG: number | null;
  effectiveFrom: Date;
};

export type ValidatedTarget = {
  calories: number;
  proteinG: number;
  effectiveFromIso: string; // YYYY-MM-DD (a plain calendar date, not a timestamp).
};

export type TargetFieldErrors = Partial<
  Record<'calories' | 'proteinG' | 'effectiveFrom', string>
>;

export type TargetValidation =
  | { success: true; data: ValidatedTarget }
  | { success: false; errors: TargetFieldErrors };

// A local YYYY-MM-DD string for a date (effective_from is a DATE column, not a
// timestamp), taken in the device's calendar so "today" matches the user's day.
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const targetSchema = z.object({
  calories: z
    .number({ message: 'Enter your daily calorie target.' })
    .int('Enter the calorie target as a whole number.')
    .min(
      TARGET_CALORIE_MIN,
      `The calorie target must be at least ${TARGET_CALORIE_MIN}.`,
    )
    .max(
      TARGET_CALORIE_MAX,
      `The calorie target must be at most ${TARGET_CALORIE_MAX}.`,
    ),
  effectiveFrom: z.date({ message: 'Choose when this target starts.' }),
  proteinG: z
    .number({ message: 'Enter your daily protein target.' })
    .min(0, 'The protein target cannot be negative.')
    .max(
      TARGET_PROTEIN_MAX,
      `The protein target must be at most ${TARGET_PROTEIN_MAX} g.`,
    )
    .refine(hasAtMostTwoDecimals, {
      message: 'Enter the protein target to at most two decimal places.',
    }),
});

export function validateTarget(draft: TargetDraft): TargetValidation {
  const parsed = targetSchema.safeParse(draft);
  if (!parsed.success) {
    return {
      errors: collectErrors<keyof TargetFieldErrors>(parsed.error),
      success: false,
    };
  }
  return {
    data: {
      calories: parsed.data.calories,
      effectiveFromIso: toIsoDate(parsed.data.effectiveFrom),
      proteinG: parsed.data.proteinG,
    },
    success: true,
  };
}

// ---- Meal template (docs/05 §5.7: a reusable collection of foods and quantities) ---

export type MealTemplateItemDraft = {
  foodId?: string | null;
  description: string;
  servingQuantity: number;
  calories: number;
  proteinG: number;
  carbohydrateG?: number | null;
  fatG?: number | null;
};

export type ValidatedMealTemplate = {
  name: string;
  items: {
    foodId: string | null;
    description: string;
    servingQuantity: number;
    calories: number;
    proteinG: number;
    carbohydrateG: number | null;
    fatG: number | null;
  }[];
};

export type MealTemplateErrors = { name?: string; items?: string };

export type MealTemplateValidation =
  | { success: true; data: ValidatedMealTemplate }
  | { success: false; errors: MealTemplateErrors };

const mealTemplateItemSchema = z.object({
  calories: calorieField(),
  carbohydrateG: optionalGramsField('carbohydrate'),
  description: z
    .string()
    .trim()
    .min(1, 'Each item needs a name.')
    .max(MAX_DESCRIPTION_LENGTH),
  fatG: optionalGramsField('fat'),
  foodId: z.string().uuid().nullish(),
  proteinG: gramsField('protein'),
  servingQuantity: z
    .number()
    .positive('The serving quantity must be greater than zero.')
    .refine(hasAtMostTwoDecimals, {
      message: 'Enter the serving quantity to at most two decimal places.',
    }),
});

const mealTemplateSchema = z.object({
  items: z
    .array(mealTemplateItemSchema)
    .min(1, 'Add at least one food to the meal.')
    .max(
      MAX_TEMPLATE_ITEMS,
      `A meal can hold at most ${MAX_TEMPLATE_ITEMS} items.`,
    ),
  name: z
    .string()
    .trim()
    .min(1, 'Give this meal a name.')
    .max(MAX_NAME_LENGTH, `Keep the name under ${MAX_NAME_LENGTH} characters.`),
});

export function validateMealTemplate(draft: {
  name: string;
  items: MealTemplateItemDraft[];
}): MealTemplateValidation {
  const parsed = mealTemplateSchema.safeParse(draft);
  if (!parsed.success) {
    const errors: MealTemplateErrors = {};
    for (const issue of parsed.error.issues) {
      if (issue.path[0] === 'name' && !errors.name) {
        errors.name = issue.message;
      } else if (issue.path[0] === 'items' && !errors.items) {
        errors.items = issue.message;
      }
    }
    return { errors, success: false };
  }
  return {
    data: {
      items: parsed.data.items.map((item) => ({
        calories: item.calories,
        carbohydrateG: item.carbohydrateG ?? null,
        description: item.description,
        fatG: item.fatG ?? null,
        foodId: item.foodId ?? null,
        proteinG: item.proteinG,
        servingQuantity: item.servingQuantity,
      })),
      name: parsed.data.name,
    },
    success: true,
  };
}
