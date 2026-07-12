import { Controller, useForm } from 'react-hook-form';

import { Card } from '@/components/common';
import { OptionGroup, TextField } from '@/components/forms';

import { useOnboarding } from '../OnboardingProvider';
import { OnboardingStepScaffold } from '../OnboardingStepScaffold';
import {
  OBJECTIVE_LABELS,
  OBJECTIVES,
  PROGRESS_RATE_LABELS,
  PROGRESS_RATES,
  type GoalsData,
} from '../onboardingModel';
import { createStepResolver } from '../onboardingResolvers';
import { type GoalsFormValues, validateGoals } from '../onboardingSchema';

const OBJECTIVE_OPTIONS = OBJECTIVES.map((value) => ({
  label: OBJECTIVE_LABELS[value],
  value,
}));

const RATE_OPTIONS = PROGRESS_RATES.map((value) => ({
  label: PROGRESS_RATE_LABELS[value],
  value,
}));

function defaultsFrom(goals: GoalsData | undefined): GoalsFormValues {
  return {
    currentWeightKg: goals ? String(goals.currentWeightKg) : '',
    heightCm: goals ? String(goals.heightCm) : '',
    mainObjective: goals ? goals.mainObjective : '',
    preferredRate: goals ? goals.preferredRate : '',
    targetWeightKg: goals ? String(goals.targetWeightKg) : '',
    waistCm: goals ? String(goals.waistCm) : '',
  };
}

export function GoalsStep() {
  const { draft, goBack, saveStep } = useOnboarding();
  const { control, handleSubmit } = useForm<
    GoalsFormValues,
    unknown,
    GoalsData
  >({
    defaultValues: defaultsFrom(draft.goals),
    resolver: createStepResolver(validateGoals),
  });

  const onValid = handleSubmit(async (data) => {
    await saveStep({ goals: data }, 'availability');
  });

  return (
    <OnboardingStepScaffold
      step="goals"
      title="Goals and measurements"
      intro="These help shape a sensible starting plan. Enter whole numbers where you can."
      primaryLabel="Continue"
      onPrimary={onValid}
      onBack={goBack}
    >
      <Card>
        <Controller
          control={control}
          name="heightCm"
          render={({ field, fieldState }) => (
            <TextField
              error={fieldState.error?.message}
              keyboardType="numeric"
              label="Height (cm)"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="currentWeightKg"
          render={({ field, fieldState }) => (
            <TextField
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              label="Current weight (kg)"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="waistCm"
          render={({ field, fieldState }) => (
            <TextField
              error={fieldState.error?.message}
              keyboardType="numeric"
              label="Waist (cm)"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="targetWeightKg"
          render={({ field, fieldState }) => (
            <TextField
              error={fieldState.error?.message}
              keyboardType="decimal-pad"
              label="Target weight (kg)"
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              value={field.value}
            />
          )}
        />
      </Card>
      <Card>
        <Controller
          control={control}
          name="mainObjective"
          render={({ field, fieldState }) => (
            <OptionGroup
              error={fieldState.error?.message}
              label="Main objective"
              onChange={field.onChange}
              options={OBJECTIVE_OPTIONS}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="preferredRate"
          render={({ field, fieldState }) => (
            <OptionGroup
              description="Rebuild keeps changes gradual. A steady pace suits most people."
              error={fieldState.error?.message}
              label="Preferred rate of progress"
              onChange={field.onChange}
              options={RATE_OPTIONS}
              value={field.value}
            />
          )}
        />
      </Card>
    </OnboardingStepScaffold>
  );
}
