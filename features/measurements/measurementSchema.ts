// Validation for the weight and waist entry forms (docs/03 S-034), kept out of the
// components so it can be reused and unit tested (mirrors
// features/readiness/readinessSchema.ts and features/onboarding/onboardingSchema.ts).
// Every field is enforced with a plain British-English message.
//
// This is a plain owner-scoped logging feature: there is no safety rule a client could
// violate by logging a measurement, so unlike readiness there is no server re-computation
// — validation here IS the boundary that keeps malformed numbers out of the database
// (docs/10 §10.7 "malformed numeric values", "oversized notes"). The bounds mirror the
// body_measurements column constraints (value numeric(7,2) > 0, conditions_note <= 500).

import { z } from 'zod';

export const MEASUREMENT_TYPES = ['weight', 'waist'] as const;
export type MeasurementType = (typeof MEASUREMENT_TYPES)[number];

// Per-type bounds, unit and copy. Weight is stored in kilograms and waist in
// centimetres (AGENTS.md engineering standards). The ranges reject implausible entries
// (a mistyped 8000 kg) while staying well inside the numeric(7,2) column.
export const MEASUREMENT_CONFIG: Record<
  MeasurementType,
  { unit: string; min: number; max: number; label: string; noun: string }
> = {
  waist: {
    label: 'Waist',
    max: 300,
    min: 20,
    noun: 'waist measurement',
    unit: 'cm',
  },
  weight: { label: 'Weight', max: 500, min: 20, noun: 'weight', unit: 'kg' },
};

// The maximum note length, matching the body_measurements.conditions_note check.
export const MAX_NOTE_LENGTH = 500;

// The numeric(7,2) column stores at most two decimal places.
function hasAtMostTwoDecimals(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-6;
}

// A validated, ready-to-insert measurement. `value` is in the type's unit; `measuredAtIso`
// is a UTC timestamp; `conditionsNote` is trimmed or null.
export type ValidatedMeasurement = {
  type: MeasurementType;
  value: number;
  unit: string;
  measuredAtIso: string;
  conditionsNote: string | null;
};

// What the form collects. `value` starts null (nothing typed yet); `measuredAt` defaults
// to now but is editable so a measurement can be back-dated (docs/03 S-034).
export type MeasurementDraft = {
  type: MeasurementType;
  value: number | null;
  measuredAt: Date;
  conditionsNote?: string | undefined;
};

export type MeasurementFieldErrors = Partial<
  Record<'value' | 'measuredAt' | 'conditionsNote', string>
>;

export type MeasurementValidation =
  | { success: true; data: ValidatedMeasurement }
  | { success: false; errors: MeasurementFieldErrors };

function buildSchema(type: MeasurementType, now: Date) {
  const config = MEASUREMENT_CONFIG[type];
  const rangeMessage = `Enter your ${config.noun} between ${config.min} and ${config.max} ${config.unit}.`;
  return z.object({
    conditionsNote: z
      .string()
      .trim()
      .max(
        MAX_NOTE_LENGTH,
        `Please keep your note under ${MAX_NOTE_LENGTH} characters.`,
      )
      .optional(),
    measuredAt: z
      .date({ message: 'Choose when this was measured.' })
      .refine(
        (date) => date.getTime() <= now.getTime(),
        'The date cannot be in the future.',
      ),
    value: z
      .number({ message: `Enter your ${config.noun} in ${config.unit}.` })
      .refine((value) => Number.isFinite(value), {
        message: `Enter your ${config.noun} in ${config.unit}.`,
      })
      .refine((value) => value >= config.min && value <= config.max, {
        message: rangeMessage,
      })
      .refine(hasAtMostTwoDecimals, {
        message: `Enter your ${config.noun} to at most two decimal places.`,
      }),
  });
}

// Validate a draft, returning either the ready-to-insert data or per-field
// British-English messages (mirrors the readiness/onboarding validators). `now` is
// injectable so the future-date rule is deterministic in tests.
export function validateMeasurement(
  draft: MeasurementDraft,
  now: Date = new Date(),
): MeasurementValidation {
  const config = MEASUREMENT_CONFIG[draft.type];
  const parsed = buildSchema(draft.type, now).safeParse({
    conditionsNote: draft.conditionsNote,
    measuredAt: draft.measuredAt,
    value: draft.value,
  });
  if (parsed.success) {
    const note = parsed.data.conditionsNote?.trim();
    return {
      data: {
        conditionsNote: note ? note : null,
        measuredAtIso: parsed.data.measuredAt.toISOString(),
        type: draft.type,
        unit: config.unit,
        value: parsed.data.value,
      },
      success: true,
    };
  }
  const errors: MeasurementFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof MeasurementFieldErrors | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { errors, success: false };
}
