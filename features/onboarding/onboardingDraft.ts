// The onboarding draft: the resumable, partially completed record. It is held
// in local secure storage (see onboardingStorage.ts) rather than Supabase,
// because docs/05 models only a completed profile (profiles.onboarding_completed_at)
// and not an in-progress draft, and docs/04 requires partially completed forms
// to survive offline. Persisted JSON is re-validated with Zod on load, since
// stored data is treated as external input.

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
  OBJECTIVES,
  PROGRESS_RATES,
  SESSION_DURATIONS,
  TRAINING_DAYS,
  WALKING_TOLERANCE,
} from './onboardingModel';
import { ONBOARDING_STEPS, type OnboardingStepId } from './onboardingSteps';

export type OnboardingDraft = {
  version: 1;
  currentStepId: OnboardingStepId;
  goals?: GoalsData;
  availability?: AvailabilityData;
  achilles?: AchillesData;
  completedAt?: string;
};

const stepIds = ONBOARDING_STEPS.map((step) => step.id) as [
  OnboardingStepId,
  ...OnboardingStepId[],
];

const goalsDataSchema = z.object({
  heightCm: z.number(),
  currentWeightKg: z.number(),
  waistCm: z.number(),
  targetWeightKg: z.number(),
  mainObjective: z.enum(OBJECTIVES),
  preferredRate: z.enum(PROGRESS_RATES),
});

const availabilityDataSchema = z.object({
  trainingDays: z.array(z.enum(TRAINING_DAYS)),
  sessionDurationMinutes: z
    .number()
    .refine((value) =>
      (SESSION_DURATIONS as readonly number[]).includes(value),
    ),
  gymAccess: z.enum(GYM_ACCESS),
  homeEquipment: z.array(z.enum(HOME_EQUIPMENT)),
  preferredCardio: z.array(z.enum(CARDIO_OPTIONS)),
});

const achillesDataSchema = z.object({
  previousInjuryAcknowledged: z.boolean(),
  painStiffness: z.enum(ACHILLES_SYMPTOMS),
  walkingTolerance: z.enum(WALKING_TOLERANCE),
  calfRaiseCapability: z.enum(CALF_RAISE_CAPABILITY),
  professionalRestrictions: z.string(),
});

const draftSchema = z.object({
  version: z.literal(1),
  currentStepId: z.enum(stepIds),
  goals: goalsDataSchema.optional(),
  availability: availabilityDataSchema.optional(),
  achilles: achillesDataSchema.optional(),
  completedAt: z.string().optional(),
});

export const EMPTY_DRAFT: OnboardingDraft = {
  version: 1,
  currentStepId: 'welcome',
};

export function serialiseDraft(draft: OnboardingDraft): string {
  return JSON.stringify(draft);
}

// Never throws: any malformed or outdated stored value falls back to a fresh
// draft so a corrupt cache can't wedge a user out of onboarding. The cast is
// sound because draftSchema has just checked every field at runtime (the only
// gap is the session-duration literal, which the refine above constrains).
export function parseDraft(raw: string | null): OnboardingDraft {
  if (!raw) {
    return EMPTY_DRAFT;
  }
  try {
    const result = draftSchema.safeParse(JSON.parse(raw));
    return result.success ? (result.data as OnboardingDraft) : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function isDraftComplete(draft: OnboardingDraft): boolean {
  return typeof draft.completedAt === 'string';
}
