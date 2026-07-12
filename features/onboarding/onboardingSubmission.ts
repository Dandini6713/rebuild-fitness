// Maps a completed onboarding draft onto the rows we write to Supabase on
// confirmation (S-005). Pure: it builds the payload; onboardingRepository.ts
// performs the writes. Only the tables that exist after roadmap 03 are targeted
// — profiles, goals and health_context.
//
// Availability, equipment and the preferred pace are captured during onboarding
// but have no table yet (availability_preferences / user_equipment are not in
// the schema). They are retained in the local draft and left for roadmap 06,
// which introduces the plan-seeding schema that consumes them.

import type { TablesInsert } from '@/lib/supabase';

import {
  ACHILLES_SYMPTOM_LABELS,
  AchillesData,
  CALF_RAISE_CAPABILITY_LABELS,
  GoalsData,
  WALKING_TOLERANCE_LABELS,
} from './onboardingModel';

export type OnboardingSubmission = {
  profile: TablesInsert<'profiles'>;
  goals: TablesInsert<'goals'>[];
  healthContext: TablesInsert<'health_context'>[];
};

export type BuildSubmissionInput = {
  userId: string;
  completedAt: string;
  goals: GoalsData;
  achilles: AchillesData;
};

export function buildOnboardingSubmission(
  input: BuildSubmissionInput,
): OnboardingSubmission {
  const { achilles, completedAt, goals, userId } = input;

  const profile: TablesInsert<'profiles'> = {
    user_id: userId,
    height_cm: goals.heightCm,
    onboarding_completed_at: completedAt,
  };

  const goalRows: TablesInsert<'goals'>[] = [
    {
      user_id: userId,
      goal_type: goals.mainObjective,
      start_value: goals.currentWeightKg,
      target_value: goals.targetWeightKg,
      is_active: true,
    },
    {
      user_id: userId,
      goal_type: 'waist',
      start_value: goals.waistCm,
      is_active: true,
    },
  ];

  const restrictions = achilles.professionalRestrictions.trim();
  const healthContext: TablesInsert<'health_context'>[] = [
    {
      user_id: userId,
      context_type: 'achilles_history',
      body_area: 'right_achilles',
      // Self-reported context only. Deliberately factual, not a diagnosis.
      description: [
        `Pain and stiffness: ${ACHILLES_SYMPTOM_LABELS[achilles.painStiffness].toLowerCase()}.`,
        `Walking: ${WALKING_TOLERANCE_LABELS[achilles.walkingTolerance].toLowerCase()}.`,
        `Single-leg calf raise: ${CALF_RAISE_CAPABILITY_LABELS[achilles.calfRaiseCapability].toLowerCase()}.`,
      ].join(' '),
      professional_restrictions: restrictions === '' ? null : restrictions,
      active: true,
    },
  ];

  return { profile, goals: goalRows, healthContext };
}
