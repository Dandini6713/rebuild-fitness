import { Controller, useForm } from 'react-hook-form';

import { Card } from '@/components/common';
import { MultiOptionGroup, OptionGroup } from '@/components/forms';

import { useOnboarding } from '../OnboardingProvider';
import { OnboardingStepScaffold } from '../OnboardingStepScaffold';
import {
  type AvailabilityData,
  CARDIO_OPTION_LABELS,
  CARDIO_OPTIONS,
  GYM_ACCESS,
  GYM_ACCESS_LABELS,
  HOME_EQUIPMENT,
  HOME_EQUIPMENT_LABELS,
  SESSION_DURATIONS,
  TRAINING_DAY_LABELS,
  TRAINING_DAYS,
} from '../onboardingModel';
import { createStepResolver } from '../onboardingResolvers';
import {
  type AvailabilityFormValues,
  validateAvailability,
} from '../onboardingSchema';

const DAY_OPTIONS = TRAINING_DAYS.map((value) => ({
  label: TRAINING_DAY_LABELS[value],
  value,
}));

const DURATION_OPTIONS = SESSION_DURATIONS.map((value) => ({
  label: `${value} minutes`,
  value: String(value) as '30' | '45' | '60',
}));

const GYM_OPTIONS = GYM_ACCESS.map((value) => ({
  label: GYM_ACCESS_LABELS[value],
  value,
}));

const EQUIPMENT_OPTIONS = HOME_EQUIPMENT.map((value) => ({
  label: HOME_EQUIPMENT_LABELS[value],
  value,
}));

const CARDIO_OPTIONS_LIST = CARDIO_OPTIONS.map((value) => ({
  label: CARDIO_OPTION_LABELS[value],
  value,
}));

function defaultsFrom(
  availability: AvailabilityData | undefined,
): AvailabilityFormValues {
  return {
    gymAccess: availability ? availability.gymAccess : '',
    homeEquipment: availability ? availability.homeEquipment : [],
    preferredCardio: availability ? availability.preferredCardio : [],
    sessionDurationMinutes: availability
      ? (String(availability.sessionDurationMinutes) as '30' | '45' | '60')
      : '',
    trainingDays: availability ? availability.trainingDays : [],
  };
}

export function AvailabilityStep() {
  const { draft, goBack, saveStep } = useOnboarding();
  const { control, handleSubmit } = useForm<
    AvailabilityFormValues,
    unknown,
    AvailabilityData
  >({
    defaultValues: defaultsFrom(draft.availability),
    resolver: createStepResolver(validateAvailability),
  });

  const onValid = handleSubmit(async (data) => {
    await saveStep({ availability: data }, 'achilles');
  });

  return (
    <OnboardingStepScaffold
      step="availability"
      title="Availability and equipment"
      intro="This helps the plan fit your week and the equipment you have."
      primaryLabel="Continue"
      onPrimary={onValid}
      onBack={goBack}
    >
      <Card>
        <Controller
          control={control}
          name="trainingDays"
          render={({ field, fieldState }) => (
            <MultiOptionGroup
              description="Choose the days you can usually train."
              error={fieldState.error?.message}
              label="Available training days"
              onChange={field.onChange}
              options={DAY_OPTIONS}
              values={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="sessionDurationMinutes"
          render={({ field, fieldState }) => (
            <OptionGroup
              error={fieldState.error?.message}
              label="Preferred session duration"
              onChange={field.onChange}
              options={DURATION_OPTIONS}
              value={field.value}
            />
          )}
        />
      </Card>
      <Card>
        <Controller
          control={control}
          name="gymAccess"
          render={({ field, fieldState }) => (
            <OptionGroup
              error={fieldState.error?.message}
              label="Gym access"
              onChange={field.onChange}
              options={GYM_OPTIONS}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="homeEquipment"
          render={({ field, fieldState }) => (
            <MultiOptionGroup
              error={fieldState.error?.message}
              label="Home equipment"
              onChange={field.onChange}
              options={EQUIPMENT_OPTIONS}
              values={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="preferredCardio"
          render={({ field, fieldState }) => (
            <MultiOptionGroup
              error={fieldState.error?.message}
              label="Preferred cardio options"
              onChange={field.onChange}
              options={CARDIO_OPTIONS_LIST}
              values={field.value}
            />
          )}
        />
      </Card>
    </OnboardingStepScaffold>
  );
}
