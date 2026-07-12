// Domain model for onboarding: option sets, British-English labels and the
// typed shapes each step produces. No React, no I/O — safe to unit test.
//
// Units follow AGENTS.md: weight in kilograms, waist and height in centimetres,
// integers where practical. Nothing here calculates or implies medical fitness;
// the Achilles answers are self-reported context only (see docs/07).

export const OBJECTIVES = [
  'lose_fat',
  'reduce_waist',
  'build_strength',
  'improve_fitness',
  'maintain',
] as const;
export type Objective = (typeof OBJECTIVES)[number];

export const OBJECTIVE_LABELS: Record<Objective, string> = {
  lose_fat: 'Lose body fat',
  reduce_waist: 'Reduce my waist',
  build_strength: 'Build strength',
  improve_fitness: 'Improve fitness',
  maintain: 'Maintain and feel steady',
};

export const PROGRESS_RATES = ['gentle', 'steady'] as const;
export type ProgressRate = (typeof PROGRESS_RATES)[number];

export const PROGRESS_RATE_LABELS: Record<ProgressRate, string> = {
  gentle: 'Gentle (about 0.25 kg a week)',
  steady: 'Steady (about 0.5 kg a week)',
};

// Approximate kilograms per week for each rate. Both sit inside the cautious
// 0.2–0.6 kg range in docs/01; the app never encourages faster loss (docs/07).
export const PROGRESS_RATE_KG_PER_WEEK: Record<ProgressRate, number> = {
  gentle: 0.25,
  steady: 0.5,
};

export const TRAINING_DAYS = [
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
  'sunday',
] as const;
export type TrainingDay = (typeof TRAINING_DAYS)[number];

export const TRAINING_DAY_LABELS: Record<TrainingDay, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

export const SESSION_DURATIONS = [30, 45, 60] as const;
export type SessionDuration = (typeof SESSION_DURATIONS)[number];

export const GYM_ACCESS = ['no_gym', 'gym'] as const;
export type GymAccess = (typeof GYM_ACCESS)[number];

export const GYM_ACCESS_LABELS: Record<GymAccess, string> = {
  no_gym: 'No gym, training at home',
  gym: 'I have gym access',
};

export const HOME_EQUIPMENT = [
  'dumbbells_10kg',
  'resistance_bands',
  'adjustable_bench',
  'pull_up_bar',
  'none',
] as const;
export type HomeEquipment = (typeof HOME_EQUIPMENT)[number];

export const HOME_EQUIPMENT_LABELS: Record<HomeEquipment, string> = {
  dumbbells_10kg: 'Two 10 kg dumbbells',
  resistance_bands: 'Resistance bands',
  adjustable_bench: 'Adjustable bench',
  pull_up_bar: 'Pull-up bar',
  none: 'No equipment yet',
};

export const CARDIO_OPTIONS = [
  'walking',
  'stationary_bike',
  'cross_trainer',
  'swimming',
  'none',
] as const;
export type CardioOption = (typeof CARDIO_OPTIONS)[number];

export const CARDIO_OPTION_LABELS: Record<CardioOption, string> = {
  walking: 'Walking',
  stationary_bike: 'Stationary bike',
  cross_trainer: 'Cross-trainer',
  swimming: 'Swimming',
  none: 'None for now',
};

export const ACHILLES_SYMPTOMS = [
  'none',
  'mild',
  'moderate',
  'significant',
] as const;
export type AchillesSymptom = (typeof ACHILLES_SYMPTOMS)[number];

export const ACHILLES_SYMPTOM_LABELS: Record<AchillesSymptom, string> = {
  none: 'No pain or stiffness',
  mild: 'Mild, and it settles quickly',
  moderate: 'Moderate at times',
  significant: 'Significant or persistent',
};

export const WALKING_TOLERANCE = [
  'unrestricted',
  'some_limits',
  'limited',
] as const;
export type WalkingTolerance = (typeof WALKING_TOLERANCE)[number];

export const WALKING_TOLERANCE_LABELS: Record<WalkingTolerance, string> = {
  unrestricted: 'I can walk normally',
  some_limits: 'Comfortable for shorter walks',
  limited: 'Limited by discomfort',
};

export const CALF_RAISE_CAPABILITY = [
  'comfortable',
  'some_difficulty',
  'unable',
] as const;
export type CalfRaiseCapability = (typeof CALF_RAISE_CAPABILITY)[number];

export const CALF_RAISE_CAPABILITY_LABELS: Record<CalfRaiseCapability, string> =
  {
    comfortable: 'Comfortable and controlled',
    some_difficulty: 'Possible, but harder on the injured side',
    unable: 'Not able yet',
  };

// Bounds for the free-numeric measurements. Height bounds match the
// profiles.height_cm check constraint in the identity migration.
export const MEASUREMENT_BOUNDS = {
  heightCm: { max: 250, min: 100 },
  waistCm: { max: 200, min: 40 },
  weightKg: { max: 400, min: 30 },
} as const;

// The mandatory wellness-boundary line for S-004. Rendered verbatim.
export const ACHILLES_BOUNDARY_STATEMENT =
  'This information helps the app choose conservative general fitness options. It does not assess whether the tendon is healed.';

// Typed, validated output of each data-collecting step.
export type GoalsData = {
  heightCm: number;
  currentWeightKg: number;
  waistCm: number;
  targetWeightKg: number;
  mainObjective: Objective;
  preferredRate: ProgressRate;
};

export type AvailabilityData = {
  trainingDays: TrainingDay[];
  sessionDurationMinutes: SessionDuration;
  gymAccess: GymAccess;
  homeEquipment: HomeEquipment[];
  preferredCardio: CardioOption[];
};

export type AchillesData = {
  previousInjuryAcknowledged: boolean;
  painStiffness: AchillesSymptom;
  walkingTolerance: WalkingTolerance;
  calfRaiseCapability: CalfRaiseCapability;
  professionalRestrictions: string;
};
