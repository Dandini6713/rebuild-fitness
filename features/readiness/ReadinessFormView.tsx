// The readiness forms (docs/03 S-011 pre-session / next-morning, and the S-015
// post-session extras), as a short accessible form. It manages its own input state
// and validates with the shared Zod schema on submit; only valid, raw answers are
// handed to the parent (never a classification — docs/06 §6.1). Copy is British
// English and never implies diagnosis (docs/07): the symptom questions are plain
// self-report, and the post-session "Achilles response" is these same symptom
// answers taken after the session.

import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText, PrimaryButton, SectionHeader } from '@/components/common';
import { FormErrorSummary } from '@/components/forms';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  type CheckinType,
  type PostSessionExtras,
  type PostSessionExtrasDraft,
  type ReadinessAnswers,
  type ReadinessAnswersDraft,
  type ReadinessFieldErrors,
  type PostSessionFieldErrors,
  validatePostSessionExtras,
  validateReadinessAnswers,
} from './readinessSchema';

type Option<T> = { value: T; label: string };

// A single-select group conveyed by label + selectable chips, with a caption error.
// Selection is shown by accessibilityState and a filled treatment, never colour
// alone (docs/03 / docs/09 §9.2).
function ChoiceGroup<T extends string | number | boolean>(props: {
  legend: string;
  hint?: string | undefined;
  options: Option<T>[];
  value: T | null;
  onSelect: (value: T) => void;
  error?: string | undefined;
  keyFor: (value: T) => string;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={props.legend}
      style={{ gap: spacing.xs }}
    >
      <AppText variant="label">{props.legend}</AppText>
      {props.hint ? (
        <AppText tone="secondary" variant="caption">
          {props.hint}
        </AppText>
      ) : null}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {props.options.map((option) => {
          const selected = props.value === option.value;
          return (
            <AppText
              accessibilityLabel={option.label}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
              key={props.keyFor(option.value)}
              onPress={() => props.onSelect(option.value)}
              style={{
                backgroundColor: selected ? colours.accent : colours.surface,
                borderColor: selected ? colours.accent : colours.border,
                borderRadius: radii.medium,
                borderWidth: 1,
                color: selected ? colours.onAccent : colours.textPrimary,
                minHeight: touchTargets.minimum,
                minWidth: touchTargets.minimum,
                overflow: 'hidden',
                paddingHorizontal: spacing.sm,
                paddingVertical: spacing.xs,
                textAlign: 'center',
              }}
            >
              {option.label}
            </AppText>
          );
        })}
      </View>
      {props.error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: colours.cautionText }}
          variant="caption"
        >
          {props.error}
        </AppText>
      ) : null}
    </View>
  );
}

function numberOptions(min: number, max: number): Option<number>[] {
  const options: Option<number>[] = [];
  for (let value = min; value <= max; value += 1) {
    options.push({ label: String(value), value });
  }
  return options;
}

const STIFFNESS_OPTIONS: Option<'better' | 'same' | 'worse'>[] = [
  { label: 'Better', value: 'better' },
  { label: 'The same', value: 'same' },
  { label: 'Worse', value: 'worse' },
];
const SWELLING_OPTIONS: Option<'none' | 'mild' | 'significant'>[] = [
  { label: 'None', value: 'none' },
  { label: 'Mild', value: 'mild' },
  { label: 'Significant', value: 'significant' },
];
const WALKING_OPTIONS: Option<'normal' | 'altered'>[] = [
  { label: 'Normal', value: 'normal' },
  { label: 'Altered', value: 'altered' },
];
const YES_NO_OPTIONS: Option<boolean>[] = [
  { label: 'No', value: false },
  { label: 'Yes', value: true },
];

const emptyAnswers: ReadinessAnswersDraft = {
  confidenceScore: null,
  painScore: null,
  stiffnessChange: null,
  suddenChange: null,
  swellingLevel: null,
  walkingStatus: null,
};

export type ReadinessFormViewProps = {
  variant: CheckinType;
  submitting: boolean;
  // Whether to offer the "schedule next-morning check" affordance (S-015): shown for
  // run and lower-body sessions. The parent decides based on the session.
  offerNextMorning?: boolean;
  onSubmit: (
    answers: ReadinessAnswers,
    extras: PostSessionExtras | null,
  ) => void;
};

export function ReadinessFormView({
  offerNextMorning = false,
  onSubmit,
  submitting,
  variant,
}: ReadinessFormViewProps) {
  const { colours, radii, spacing } = useAppTheme();
  const isPostSession = variant === 'post_session';

  const [answers, setAnswers] = useState<ReadinessAnswersDraft>(emptyAnswers);
  const [extras, setExtras] = useState<PostSessionExtrasDraft>({
    notes: '',
    scheduleNextMorning: false,
    sessionEffort: null,
  });
  const [answerErrors, setAnswerErrors] = useState<ReadinessFieldErrors>({});
  const [extraErrors, setExtraErrors] = useState<PostSessionFieldErrors>({});

  const setAnswer = <K extends keyof ReadinessAnswersDraft>(
    field: K,
    value: ReadinessAnswersDraft[K],
  ) => {
    setAnswers((current) => ({ ...current, [field]: value }));
  };

  const handleSubmit = () => {
    const answerResult = validateReadinessAnswers(answers);
    let extrasResult: PostSessionExtras | null = null;
    let extrasValid = true;
    if (isPostSession) {
      const parsed = validatePostSessionExtras({
        notes: extras.notes,
        scheduleNextMorning: extras.scheduleNextMorning,
        sessionEffort: extras.sessionEffort,
      });
      if (parsed.success) {
        extrasResult = parsed.data;
        setExtraErrors({});
      } else {
        extrasValid = false;
        setExtraErrors(parsed.errors);
      }
    } else {
      setExtraErrors({});
    }

    if (!answerResult.success) {
      setAnswerErrors(answerResult.errors);
      return;
    }
    setAnswerErrors({});
    if (!extrasValid) {
      return;
    }
    onSubmit(answerResult.data, extrasResult);
  };

  const intro = isPostSession
    ? 'A quick check on how the tendon responded to your session. These are your own answers — the app does not assess or diagnose the tendon.'
    : 'A quick check before your session. These are your own answers — the app does not assess or diagnose the tendon.';

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionHeader
        description={intro}
        title={isPostSession ? 'How did that feel?' : 'Readiness check'}
      />

      <ChoiceGroup
        error={answerErrors.painScore}
        hint="0 is no pain, 10 is the most pain."
        keyFor={(value) => `pain-${value}`}
        legend="Pain right now"
        onSelect={(value) => setAnswer('painScore', value)}
        options={numberOptions(0, 10)}
        value={answers.painScore}
      />

      <ChoiceGroup
        error={answerErrors.stiffnessChange}
        keyFor={(value) => `stiffness-${value}`}
        legend="Morning stiffness, compared with usual"
        onSelect={(value) => setAnswer('stiffnessChange', value)}
        options={STIFFNESS_OPTIONS}
        value={answers.stiffnessChange}
      />

      <ChoiceGroup
        error={answerErrors.swellingLevel}
        keyFor={(value) => `swelling-${value}`}
        legend="Swelling"
        onSelect={(value) => setAnswer('swellingLevel', value)}
        options={SWELLING_OPTIONS}
        value={answers.swellingLevel}
      />

      <ChoiceGroup
        error={answerErrors.walkingStatus}
        keyFor={(value) => `walking-${value}`}
        legend="Walking"
        onSelect={(value) => setAnswer('walkingStatus', value)}
        options={WALKING_OPTIONS}
        value={answers.walkingStatus}
      />

      <ChoiceGroup
        error={answerErrors.suddenChange}
        hint="For example a sudden pulling, popping or sharp change."
        keyFor={(value) => `sudden-${String(value)}`}
        legend="Any sudden new change?"
        onSelect={(value) => setAnswer('suddenChange', value)}
        options={YES_NO_OPTIONS}
        value={answers.suddenChange}
      />

      <ChoiceGroup
        error={answerErrors.confidenceScore}
        hint="1 is not confident, 5 is fully confident."
        keyFor={(value) => `confidence-${value}`}
        legend="How confident do you feel today?"
        onSelect={(value) => setAnswer('confidenceScore', value)}
        options={numberOptions(1, 5)}
        value={answers.confidenceScore}
      />

      {isPostSession ? (
        <>
          <ChoiceGroup
            error={extraErrors.sessionEffort}
            hint="1 is very easy, 10 is maximal."
            keyFor={(value) => `effort-${value}`}
            legend="How hard did the session feel?"
            onSelect={(value) =>
              setExtras((current) => ({ ...current, sessionEffort: value }))
            }
            options={numberOptions(1, 10)}
            value={extras.sessionEffort}
          />

          <View style={{ gap: spacing.xs }}>
            <AppText variant="label">Notes (optional)</AppText>
            <TextInput
              accessibilityLabel="Notes"
              multiline
              onChangeText={(text) =>
                setExtras((current) => ({ ...current, notes: text }))
              }
              placeholder="Anything you want to remember about this session."
              placeholderTextColor={colours.textTertiary}
              style={{
                borderColor: colours.border,
                borderRadius: radii.medium,
                borderWidth: 1,
                color: colours.textPrimary,
                minHeight: 88,
                padding: spacing.sm,
                textAlignVertical: 'top',
              }}
              value={extras.notes}
            />
            {extraErrors.notes ? (
              <AppText
                accessibilityLiveRegion="polite"
                style={{ color: colours.cautionText }}
                variant="caption"
              >
                {extraErrors.notes}
              </AppText>
            ) : null}
          </View>

          {offerNextMorning ? (
            <ChoiceGroup
              hint="Recommended after a run or a lower-body session."
              keyFor={(value) => `next-morning-${String(value)}`}
              legend="Schedule a next-morning check?"
              onSelect={(value) =>
                setExtras((current) => ({
                  ...current,
                  scheduleNextMorning: value,
                }))
              }
              options={YES_NO_OPTIONS}
              value={extras.scheduleNextMorning ?? false}
            />
          ) : null}
        </>
      ) : null}

      <FormErrorSummary
        errors={[
          answerErrors.painScore,
          answerErrors.stiffnessChange,
          answerErrors.swellingLevel,
          answerErrors.walkingStatus,
          answerErrors.suddenChange,
          answerErrors.confidenceScore,
          extraErrors.sessionEffort,
          extraErrors.notes,
        ]}
      />

      <PrimaryButton
        label="See my result"
        loading={submitting}
        onPress={handleSubmit}
      />
    </View>
  );
}
