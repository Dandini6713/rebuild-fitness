import { Controller, useForm } from 'react-hook-form';

import { AppText, Card, StatusBadge } from '@/components/common';
import { CheckboxField, OptionGroup, TextField } from '@/components/forms';

import { useOnboarding } from '../OnboardingProvider';
import { OnboardingStepScaffold } from '../OnboardingStepScaffold';
import {
  ACHILLES_BOUNDARY_STATEMENT,
  ACHILLES_SYMPTOM_LABELS,
  ACHILLES_SYMPTOMS,
  type AchillesData,
  CALF_RAISE_CAPABILITY,
  CALF_RAISE_CAPABILITY_LABELS,
  WALKING_TOLERANCE,
  WALKING_TOLERANCE_LABELS,
} from '../onboardingModel';
import { createStepResolver } from '../onboardingResolvers';
import { type AchillesFormValues, validateAchilles } from '../onboardingSchema';

const SYMPTOM_OPTIONS = ACHILLES_SYMPTOMS.map((value) => ({
  label: ACHILLES_SYMPTOM_LABELS[value],
  value,
}));

const WALKING_OPTIONS = WALKING_TOLERANCE.map((value) => ({
  label: WALKING_TOLERANCE_LABELS[value],
  value,
}));

const CALF_RAISE_OPTIONS = CALF_RAISE_CAPABILITY.map((value) => ({
  label: CALF_RAISE_CAPABILITY_LABELS[value],
  value,
}));

function defaultsFrom(achilles: AchillesData | undefined): AchillesFormValues {
  return {
    calfRaiseCapability: achilles ? achilles.calfRaiseCapability : '',
    painStiffness: achilles ? achilles.painStiffness : '',
    previousInjuryAcknowledged: achilles
      ? achilles.previousInjuryAcknowledged
      : false,
    professionalRestrictions: achilles ? achilles.professionalRestrictions : '',
    walkingTolerance: achilles ? achilles.walkingTolerance : '',
  };
}

export function AchillesStep() {
  const { draft, goBack, saveStep } = useOnboarding();
  const { control, handleSubmit } = useForm<
    AchillesFormValues,
    unknown,
    AchillesData
  >({
    defaultValues: defaultsFrom(draft.achilles),
    resolver: createStepResolver(validateAchilles),
  });

  const onValid = handleSubmit(async (data) => {
    await saveStep({ achilles: data }, 'confirm');
  });

  return (
    <OnboardingStepScaffold
      step="achilles"
      title="Achilles and current capability"
      primaryLabel="Continue"
      onPrimary={onValid}
      onBack={goBack}
    >
      <Card>
        <StatusBadge label="Please read" tone="info" />
        <AppText>{ACHILLES_BOUNDARY_STATEMENT}</AppText>
      </Card>
      <Card>
        <Controller
          control={control}
          name="previousInjuryAcknowledged"
          render={({ field, fieldState }) => (
            <CheckboxField
              checked={field.value}
              error={fieldState.error?.message}
              label="I understand this is background context, not a medical assessment."
              onChange={field.onChange}
            />
          )}
        />
      </Card>
      <Card>
        <Controller
          control={control}
          name="painStiffness"
          render={({ field, fieldState }) => (
            <OptionGroup
              error={fieldState.error?.message}
              label="Current pain and stiffness"
              onChange={field.onChange}
              options={SYMPTOM_OPTIONS}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="walkingTolerance"
          render={({ field, fieldState }) => (
            <OptionGroup
              error={fieldState.error?.message}
              label="Walking tolerance"
              onChange={field.onChange}
              options={WALKING_OPTIONS}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="calfRaiseCapability"
          render={({ field, fieldState }) => (
            <OptionGroup
              description="A single-leg calf raise means rising onto the toes of one foot."
              error={fieldState.error?.message}
              label="Single-leg calf-raise capability"
              onChange={field.onChange}
              options={CALF_RAISE_OPTIONS}
              value={field.value}
            />
          )}
        />
        <Controller
          control={control}
          name="professionalRestrictions"
          render={({ field, fieldState }) => (
            <TextField
              error={fieldState.error?.message}
              label="Existing professional restrictions (optional)"
              multiline
              onBlur={field.onBlur}
              onChangeText={field.onChange}
              placeholder="For example, advice from a physiotherapist you would like the app to respect."
              value={field.value}
            />
          )}
        />
      </Card>
    </OnboardingStepScaffold>
  );
}
