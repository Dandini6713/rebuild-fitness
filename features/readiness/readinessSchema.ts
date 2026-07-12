// Validation for the readiness forms (docs/03 S-011 and S-015), kept out of the
// components so they can be reused and unit tested (mirrors
// features/onboarding/onboardingSchema.ts). Every required field is enforced with a
// plain British-English message; numeric answers are chosen from bounded controls in
// the UI, so the schema validates the resolved values rather than parsing strings.
//
// The client validates here purely to guide the form. It is NOT the safety boundary:
// the classification is always re-computed server-side by submit_readiness_checkin
// (docs/06 §6.1). The client only ever sends these raw answers.

import { z } from 'zod';

export const STIFFNESS_CHANGES = ['better', 'same', 'worse'] as const;
export const SWELLING_LEVELS = ['none', 'mild', 'significant'] as const;
export const WALKING_STATUSES = ['normal', 'altered'] as const;
export const CHECKIN_TYPES = [
  'pre_session',
  'post_session',
  'next_morning',
] as const;

export type CheckinType = (typeof CHECKIN_TYPES)[number];

// The six S-011 symptom answers, shared by the pre-session and next-morning checks
// and reused as the S-015 post-session Achilles response. Fields start null in a
// draft (unanswered); validation enforces every one before a result can be shown.
export const readinessAnswersSchema = z.object({
  painScore: z
    .number({ message: 'Choose your pain level from 0 to 10.' })
    .int()
    .min(0, 'Choose your pain level from 0 to 10.')
    .max(10, 'Choose your pain level from 0 to 10.'),
  stiffnessChange: z.enum(STIFFNESS_CHANGES, {
    message: 'Choose whether morning stiffness is better, the same or worse.',
  }),
  swellingLevel: z.enum(SWELLING_LEVELS, {
    message: 'Choose whether there is no, mild or significant swelling.',
  }),
  walkingStatus: z.enum(WALKING_STATUSES, {
    message: 'Choose whether walking feels normal or altered.',
  }),
  suddenChange: z.boolean({
    message: 'Choose whether you noticed a sudden new change.',
  }),
  confidenceScore: z
    .number({ message: 'Choose your confidence from 1 to 5.' })
    .int()
    .min(1, 'Choose your confidence from 1 to 5.')
    .max(5, 'Choose your confidence from 1 to 5.'),
});

export type ReadinessAnswers = z.infer<typeof readinessAnswersSchema>;

// The S-015 post-session additions: a required session effort, an optional free-text
// note, and the "schedule a next-morning check" affordance (an intent flag; the
// scheduling itself is a documented seam — see useReadiness).
export const postSessionExtrasSchema = z.object({
  sessionEffort: z
    .number({ message: 'Choose how hard the session felt, from 1 to 10.' })
    .int()
    .min(1, 'Choose how hard the session felt, from 1 to 10.')
    .max(10, 'Choose how hard the session felt, from 1 to 10.'),
  notes: z
    .string()
    .trim()
    .max(2000, 'Please keep your note under 2000 characters.')
    .optional(),
  scheduleNextMorning: z.boolean().optional(),
});

export type PostSessionExtras = z.infer<typeof postSessionExtrasSchema>;

// A draft holds whatever the form has collected so far; any field may be unset.
export type ReadinessAnswersDraft = {
  painScore: number | null;
  stiffnessChange: (typeof STIFFNESS_CHANGES)[number] | null;
  swellingLevel: (typeof SWELLING_LEVELS)[number] | null;
  walkingStatus: (typeof WALKING_STATUSES)[number] | null;
  suddenChange: boolean | null;
  confidenceScore: number | null;
};

export type ReadinessFieldErrors = Partial<
  Record<keyof ReadinessAnswers, string>
>;

export type ReadinessValidation =
  | { success: true; data: ReadinessAnswers }
  | { success: false; errors: ReadinessFieldErrors };

// Validate the six symptom answers, returning either the typed data or per-field
// British-English messages (mirrors the onboarding validators).
export function validateReadinessAnswers(
  draft: ReadinessAnswersDraft,
): ReadinessValidation {
  const parsed = readinessAnswersSchema.safeParse(draft);
  if (parsed.success) {
    return { data: parsed.data, success: true };
  }
  const errors: ReadinessFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof ReadinessAnswers | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { errors, success: false };
}

export type PostSessionFieldErrors = Partial<
  Record<keyof PostSessionExtras, string>
>;

export type PostSessionValidation =
  | { success: true; data: PostSessionExtras }
  | { success: false; errors: PostSessionFieldErrors };

export type PostSessionExtrasDraft = {
  sessionEffort: number | null;
  notes?: string | undefined;
  scheduleNextMorning?: boolean | undefined;
};

export function validatePostSessionExtras(
  draft: PostSessionExtrasDraft,
): PostSessionValidation {
  const parsed = postSessionExtrasSchema.safeParse(draft);
  if (parsed.success) {
    return { data: parsed.data, success: true };
  }
  const errors: PostSessionFieldErrors = {};
  for (const issue of parsed.error.issues) {
    const field = issue.path[0] as keyof PostSessionExtras | undefined;
    if (field && !errors[field]) {
      errors[field] = issue.message;
    }
  }
  return { errors, success: false };
}
