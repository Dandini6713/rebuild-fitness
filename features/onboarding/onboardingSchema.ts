// Validation schemas for the onboarding steps, kept out of the components so
// they can be reused and unit tested (mirrors features/auth/authValidation.ts).
//
// Each validator accepts the raw form values (numbers arrive as strings from a
// TextInput, single/multi selects may be empty) and returns either the typed,
// bounded data or per-field British-English messages.

import { z } from 'zod';

import {
  ACHILLES_SYMPTOMS,
  AchillesData,
  AvailabilityData,
  CALF_RAISE_CAPABILITY,
  CARDIO_OPTIONS,
  GYM_ACCESS,
  GoalsData,
  HOME_EQUIPMENT,
  MEASUREMENT_BOUNDS,
  OBJECTIVES,
  PROGRESS_RATES,
  SESSION_DURATIONS,
  SessionDuration,
  TRAINING_DAYS,
  WALKING_TOLERANCE,
} from './onboardingModel';

const NUMERIC_PATTERN = /^\d+(\.\d+)?$/;

function numericField(label: string, bounds: { max: number; min: number }) {
  return z
    .string()
    .trim()
    .min(1, `Enter your ${label}.`)
    .refine((value) => NUMERIC_PATTERN.test(value), {
      message: `Enter your ${label} as a number.`,
    })
    .transform((value) => Number(value))
    .refine((value) => value >= bounds.min && value <= bounds.max, {
      message: `Enter your ${label} between ${bounds.min} and ${bounds.max}.`,
    });
}

export const goalsSchema = z.object({
  heightCm: numericField('height in centimetres', MEASUREMENT_BOUNDS.heightCm),
  currentWeightKg: numericField(
    'current weight in kilograms',
    MEASUREMENT_BOUNDS.weightKg,
  ),
  waistCm: numericField('waist in centimetres', MEASUREMENT_BOUNDS.waistCm),
  targetWeightKg: numericField(
    'target weight in kilograms',
    MEASUREMENT_BOUNDS.weightKg,
  ),
  mainObjective: z.enum(OBJECTIVES, { message: 'Choose your main objective.' }),
  preferredRate: z.enum(PROGRESS_RATES, {
    message: 'Choose a preferred pace.',
  }),
});

export const availabilitySchema = z.object({
  trainingDays: z
    .array(z.enum(TRAINING_DAYS))
    .min(1, 'Choose at least one training day.'),
  sessionDurationMinutes: z
    .enum(
      SESSION_DURATIONS.map((value) => String(value)) as [string, ...string[]],
      { message: 'Choose a preferred session length.' },
    )
    .transform((value) => Number(value) as SessionDuration),
  gymAccess: z.enum(GYM_ACCESS, {
    message: 'Let us know about gym access.',
  }),
  homeEquipment: z
    .array(z.enum(HOME_EQUIPMENT))
    .min(1, 'Choose at least one option, or “No equipment yet”.'),
  preferredCardio: z
    .array(z.enum(CARDIO_OPTIONS))
    .min(1, 'Choose at least one option, or “None for now”.'),
});

export const achillesSchema = z.object({
  previousInjuryAcknowledged: z.literal(true, {
    message: 'Please confirm you understand this is background context.',
  }),
  painStiffness: z.enum(ACHILLES_SYMPTOMS, {
    message: 'Choose the option that fits best.',
  }),
  walkingTolerance: z.enum(WALKING_TOLERANCE, {
    message: 'Choose your walking tolerance.',
  }),
  calfRaiseCapability: z.enum(CALF_RAISE_CAPABILITY, {
    message: 'Choose your calf-raise capability.',
  }),
  professionalRestrictions: z
    .string()
    .trim()
    .max(2000, 'Please shorten this to 2000 characters or fewer.')
    .default(''),
});

// Raw form shapes: what react-hook-form holds before validation.
export type GoalsFormValues = {
  heightCm: string;
  currentWeightKg: string;
  waistCm: string;
  targetWeightKg: string;
  mainObjective: '' | GoalsData['mainObjective'];
  preferredRate: '' | GoalsData['preferredRate'];
};

export type AvailabilityFormValues = {
  trainingDays: AvailabilityData['trainingDays'];
  sessionDurationMinutes: '' | '30' | '45' | '60';
  gymAccess: '' | AvailabilityData['gymAccess'];
  homeEquipment: AvailabilityData['homeEquipment'];
  preferredCardio: AvailabilityData['preferredCardio'];
};

export type AchillesFormValues = {
  previousInjuryAcknowledged: boolean;
  painStiffness: '' | AchillesData['painStiffness'];
  walkingTolerance: '' | AchillesData['walkingTolerance'];
  calfRaiseCapability: '' | AchillesData['calfRaiseCapability'];
  professionalRestrictions: string;
};

export type StepValidation<Data, Field extends string> =
  | { data: Data; success: true }
  | { fieldErrors: Partial<Record<Field, string>>; success: false };

function runValidation<Data, Field extends string>(
  schema: z.ZodType<Data>,
  input: unknown,
): StepValidation<Data, Field> {
  const result = schema.safeParse(input);
  if (result.success) {
    return { data: result.data, success: true };
  }

  const fieldErrors: Partial<Record<Field, string>> = {};
  for (const issue of result.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && fieldErrors[key as Field] === undefined) {
      fieldErrors[key as Field] = issue.message;
    }
  }
  return { fieldErrors, success: false };
}

export function validateGoals(input: GoalsFormValues) {
  return runValidation<GoalsData, keyof GoalsFormValues>(goalsSchema, input);
}

export function validateAvailability(input: AvailabilityFormValues) {
  return runValidation<AvailabilityData, keyof AvailabilityFormValues>(
    availabilitySchema,
    input,
  );
}

export function validateAchilles(input: AchillesFormValues) {
  return runValidation<AchillesData, keyof AchillesFormValues>(
    achillesSchema,
    input,
  );
}
