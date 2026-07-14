// The weight/waist entry form (docs/03 S-034), as a short accessible form. It manages
// its own input state, validates with the shared Zod schema on submit, and hands only
// valid, ready-to-insert values to the parent (mirrors ReadinessFormView). Copy is
// British English and never shame-based or appearance-insulting (AGENTS.md rule 9,
// docs/07): a measurement is neutral data, shown with plain guidance.
//
// Numeric entry follows docs/03 §3.4: plus, minus AND direct entry, never a precise
// slider. The measured date is editable so a measurement can be back-dated; a compact
// relative-day chooser covers the common case (a full date/time picker is a later
// polish — see CLAUDE.md).

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText, PrimaryButton, SectionHeader } from '@/components/common';
import { FormErrorSummary } from '@/components/forms';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  MEASUREMENT_CONFIG,
  type MeasurementFieldErrors,
  type MeasurementType,
  type ValidatedMeasurement,
  validateMeasurement,
} from './measurementSchema';

// The step used by the − / + controls. Small enough for a real body-weight change,
// direct entry covers anything finer.
const STEP = 0.1;

// The relative-day options for "when was this measured". Today is the default; the rest
// let a measurement be back-dated without a heavy date picker.
const DAY_OPTIONS = [0, 1, 2, 3, 4, 5, 6] as const;

function dayLabel(daysAgo: number): string {
  if (daysAgo === 0) {
    return 'Today';
  }
  if (daysAgo === 1) {
    return 'Yesterday';
  }
  return `${daysAgo} days ago`;
}

// A measured-at Date `daysAgo` before `now`, keeping the current time of day.
function dateDaysAgo(now: Date, daysAgo: number): Date {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() - daysAgo);
  return date;
}

function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export type MeasurementFormViewProps = {
  type: MeasurementType;
  submitting: boolean;
  // The most recent logged value of this type, shown as guidance (docs/03 S-034 "Show
  // the most recent value"). Omitted when there is none yet.
  recentValueLabel?: string | undefined;
  now?: Date;
  onSubmit: (measurement: ValidatedMeasurement) => void;
};

export function MeasurementFormView({
  now = new Date(),
  onSubmit,
  recentValueLabel,
  submitting,
  type,
}: MeasurementFormViewProps) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const config = MEASUREMENT_CONFIG[type];

  const [valueText, setValueText] = useState('');
  const [daysAgo, setDaysAgo] = useState<number>(0);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<MeasurementFieldErrors>({});

  const parsedValue = useMemo(() => {
    const trimmed = valueText.trim();
    if (trimmed === '') {
      return null;
    }
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? parsed : Number.NaN;
  }, [valueText]);

  const adjust = (delta: number) => {
    const base =
      parsedValue === null || Number.isNaN(parsedValue)
        ? config.min
        : parsedValue;
    const next = Math.min(
      config.max,
      Math.max(config.min, roundToTwo(base + delta)),
    );
    setValueText(String(next));
  };

  const handleSubmit = () => {
    const result = validateMeasurement(
      {
        conditionsNote: note,
        measuredAt: dateDaysAgo(now, daysAgo),
        type,
        value: parsedValue,
      },
      now,
    );
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
  };

  const intro =
    type === 'weight'
      ? 'Weigh yourself at a consistent time, ideally in the morning before food. One reading is just a snapshot — the trend is what matters.'
      : 'Measure around the same point each time, relaxed and not holding your breath. One reading is just a snapshot.';

  return (
    <View style={{ gap: spacing.lg }}>
      <SectionHeader description={intro} title={`Log your ${config.noun}`} />

      {recentValueLabel ? (
        <AppText tone="secondary" variant="caption">
          {`Most recent: ${recentValueLabel}`}
        </AppText>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">{`${config.label} (${config.unit})`}</AppText>
        <View
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: spacing.sm,
          }}
        >
          <AppText
            accessibilityLabel={`Decrease ${config.noun}`}
            accessibilityRole="button"
            onPress={() => adjust(-STEP)}
            style={{
              backgroundColor: colours.surface,
              borderColor: colours.border,
              borderRadius: radii.medium,
              borderWidth: 1,
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              overflow: 'hidden',
              paddingVertical: spacing.xs,
              textAlign: 'center',
            }}
            variant="title"
          >
            −
          </AppText>
          <TextInput
            accessibilityLabel={`${config.label} in ${config.unit}`}
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={setValueText}
            placeholder={String(config.min)}
            placeholderTextColor={colours.textTertiary}
            style={{
              borderColor: colours.border,
              borderRadius: radii.medium,
              borderWidth: 1,
              color: colours.textPrimary,
              flex: 1,
              fontSize: 20,
              minHeight: touchTargets.comfortable,
              paddingHorizontal: spacing.sm,
              textAlign: 'center',
            }}
            value={valueText}
          />
          <AppText
            accessibilityLabel={`Increase ${config.noun}`}
            accessibilityRole="button"
            onPress={() => adjust(STEP)}
            style={{
              backgroundColor: colours.surface,
              borderColor: colours.border,
              borderRadius: radii.medium,
              borderWidth: 1,
              minHeight: touchTargets.minimum,
              minWidth: touchTargets.minimum,
              overflow: 'hidden',
              paddingVertical: spacing.xs,
              textAlign: 'center',
            }}
            variant="title"
          >
            +
          </AppText>
        </View>
        {errors.value ? (
          <AppText
            accessibilityLiveRegion="polite"
            style={{ color: colours.cautionText }}
            variant="caption"
          >
            {errors.value}
          </AppText>
        ) : null}
      </View>

      <View
        accessibilityRole="radiogroup"
        accessibilityLabel="When was this measured?"
        style={{ gap: spacing.xs }}
      >
        <AppText variant="label">When was this measured?</AppText>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
        >
          {DAY_OPTIONS.map((option) => {
            const selected = daysAgo === option;
            return (
              <AppText
                accessibilityLabel={dayLabel(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={`day-${option}`}
                onPress={() => setDaysAgo(option)}
                style={{
                  backgroundColor: selected ? colours.accent : colours.surface,
                  borderColor: selected ? colours.accent : colours.border,
                  borderRadius: radii.medium,
                  borderWidth: 1,
                  color: selected ? colours.onAccent : colours.textPrimary,
                  minHeight: touchTargets.minimum,
                  overflow: 'hidden',
                  paddingHorizontal: spacing.sm,
                  paddingVertical: spacing.xs,
                  textAlign: 'center',
                }}
              >
                {dayLabel(option)}
              </AppText>
            );
          })}
        </View>
        {errors.measuredAt ? (
          <AppText
            accessibilityLiveRegion="polite"
            style={{ color: colours.cautionText }}
            variant="caption"
          >
            {errors.measuredAt}
          </AppText>
        ) : null}
      </View>

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">Notes (optional)</AppText>
        <TextInput
          accessibilityLabel="Notes"
          multiline
          onChangeText={setNote}
          placeholder="For example, morning, before food."
          placeholderTextColor={colours.textTertiary}
          style={{
            borderColor: colours.border,
            borderRadius: radii.medium,
            borderWidth: 1,
            color: colours.textPrimary,
            minHeight: 72,
            padding: spacing.sm,
            textAlignVertical: 'top',
          }}
          value={note}
        />
        {errors.conditionsNote ? (
          <AppText
            accessibilityLiveRegion="polite"
            style={{ color: colours.cautionText }}
            variant="caption"
          >
            {errors.conditionsNote}
          </AppText>
        ) : null}
      </View>

      <FormErrorSummary
        errors={[errors.value, errors.measuredAt, errors.conditionsNote]}
      />

      <PrimaryButton label="Save" loading={submitting} onPress={handleSubmit} />
    </View>
  );
}
