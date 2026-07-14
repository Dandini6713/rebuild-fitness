// Presentational rendering of the effective-dated nutrition targets (docs/05 §5.7,
// docs/06 §6.8) and the form to set a new one. Pure in its props — it takes the resolved
// state and callbacks, not the hooks — so every state is testable without Supabase or
// auth (mirrors MeasurementFormView + MeasurementHistoryView). British English throughout.
//
// A target is calories + protein effective from a date, and the table keeps HISTORY: the
// current target is the latest effective_from on or before today, and setting a new one
// INSERTS a new row (never edits an old one). The form makes this explicit — it sets a
// start date and creates a new target; older targets remain in the history list.

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SectionHeader,
  StatusBadge,
} from '@/components/common';
import { FormErrorSummary } from '@/components/forms';
import { DEFAULT_PROTEIN_TARGET_G } from '@/domain/nutrition/nutritionTargets';
import { useAppTheme } from '@/theme/useAppTheme';

import type { TargetRecord } from './nutritionRepository';
import {
  type TargetFieldErrors,
  type ValidatedTarget,
  validateTarget,
} from './nutritionSchema';
import type {
  NutritionTargetsState,
  SetTargetState,
} from './useNutritionTargets';

const integer = new Intl.NumberFormat('en-GB');

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function formatIsoDate(iso: string): string {
  // effective_from is a plain YYYY-MM-DD date; parse its parts to avoid timezone shift.
  const [year, month, day] = iso.split('-').map((part) => Number(part));
  if (!year || !month || !day) {
    return iso;
  }
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

// Forward relative-day options for when a new target starts. Today is the default; a few
// days ahead lets a change be scheduled to begin later.
const DAY_OPTIONS = [0, 1, 2, 3, 7] as const;

function dayLabel(daysAhead: number): string {
  if (daysAhead === 0) return 'Today';
  if (daysAhead === 1) return 'Tomorrow';
  return `In ${daysAhead} days`;
}

function dateDaysAhead(now: Date, daysAhead: number): Date {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() + daysAhead);
  return date;
}

export function NutritionTargetView({
  now = new Date(),
  onSetTarget,
  setState,
  state,
}: {
  now?: Date;
  onSetTarget: (target: ValidatedTarget) => void;
  setState: SetTargetState;
  state: NutritionTargetsState;
}) {
  const { spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your targets…"
        label="Loading targets"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Your targets are unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} title="Can't load your targets" />
    );
  }

  const { current, history } = state.data;

  return (
    <View style={{ gap: spacing.lg }}>
      <Card accessibilityLabel="Your current daily targets.">
        <AppText variant="heading">Current daily target</AppText>
        {current ? (
          <View style={{ gap: spacing.xxs }}>
            <AppText variant="body">
              {`${integer.format(current.calories)} kcal and ${integer.format(
                Math.round(current.proteinG),
              )} g protein a day.`}
            </AppText>
            <AppText tone="secondary" variant="caption">
              {`In effect since ${formatIsoDate(current.effectiveFrom)}.`}
            </AppText>
          </View>
        ) : (
          <AppText tone="secondary">
            No target is set yet. Set one below to see your daily calories and
            protein on Today and in your diary.
          </AppText>
        )}
      </Card>

      <SetTargetForm now={now} onSetTarget={onSetTarget} setState={setState} />

      {history.length > 0 ? (
        <View style={{ gap: spacing.sm }}>
          <SectionHeader
            description="Each change is a new dated target; older ones stay here as history."
            title="Target history"
          />
          {history.map((record) => (
            <HistoryRow key={record.id} record={record} />
          ))}
        </View>
      ) : (
        <EmptyState
          description="Once you set a target, your changes will be listed here with the date each took effect."
          title="No target history yet"
        />
      )}
    </View>
  );
}

function HistoryRow({ record }: { record: TargetRecord }) {
  return (
    <Card>
      <AppText variant="body">
        {`${integer.format(record.calories)} kcal · ${integer.format(
          Math.round(record.proteinG),
        )} g protein`}
      </AppText>
      <AppText tone="secondary" variant="caption">
        {`From ${formatIsoDate(record.effectiveFrom)}`}
      </AppText>
    </Card>
  );
}

function SetTargetForm({
  now,
  onSetTarget,
  setState,
}: {
  now: Date;
  onSetTarget: (target: ValidatedTarget) => void;
  setState: SetTargetState;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [caloriesText, setCaloriesText] = useState('');
  const [proteinText, setProteinText] = useState(
    String(DEFAULT_PROTEIN_TARGET_G),
  );
  const [daysAhead, setDaysAhead] = useState<number>(0);
  const [errors, setErrors] = useState<TargetFieldErrors>({});

  const parsedCalories = useMemo(() => {
    const trimmed = caloriesText.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : Number.NaN;
  }, [caloriesText]);

  const parsedProtein = useMemo(() => {
    const trimmed = proteinText.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : Number.NaN;
  }, [proteinText]);

  const handleSubmit = () => {
    const result = validateTarget({
      calories: parsedCalories,
      effectiveFrom: dateDaysAhead(now, daysAhead),
      proteinG: parsedProtein,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSetTarget(result.data);
  };

  return (
    <Card>
      <SectionHeader
        description="Set your daily calorie and protein target. A new target keeps your history — it does not overwrite the old one."
        title="Set a new target"
      />

      <FieldRow
        error={errors.calories}
        keyboardType="number-pad"
        label="Daily calories (kcal)"
        onChangeText={setCaloriesText}
        placeholder="e.g. 2100"
        value={caloriesText}
      />
      <FieldRow
        error={errors.proteinG}
        keyboardType="decimal-pad"
        label="Daily protein (g)"
        onChangeText={setProteinText}
        placeholder={String(DEFAULT_PROTEIN_TARGET_G)}
        value={proteinText}
      />

      <View
        accessibilityLabel="When does this target start?"
        accessibilityRole="radiogroup"
        style={{ gap: spacing.xs }}
      >
        <AppText variant="label">Starts</AppText>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
        >
          {DAY_OPTIONS.map((option) => {
            const selected = daysAhead === option;
            return (
              <AppText
                accessibilityLabel={dayLabel(option)}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                key={`ahead-${option}`}
                onPress={() => setDaysAhead(option)}
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
        {errors.effectiveFrom ? (
          <AppText
            accessibilityLiveRegion="polite"
            style={{ color: colours.cautionText }}
            variant="caption"
          >
            {errors.effectiveFrom}
          </AppText>
        ) : null}
      </View>

      <FormErrorSummary
        errors={[errors.calories, errors.proteinG, errors.effectiveFrom]}
      />

      <PrimaryButton
        label="Save target"
        loading={setState.status === 'submitting'}
        onPress={handleSubmit}
      />

      {setState.status === 'saved' ? (
        <StatusBadge label="Target saved" tone="success" />
      ) : null}
      {setState.status === 'offline' ? (
        <AppText accessibilityLiveRegion="polite" variant="body">
          You appear to be offline, so this was not saved. Please try again when
          you are back online.
        </AppText>
      ) : null}
      {setState.status === 'error' ? (
        <AppText accessibilityLiveRegion="assertive" variant="body">
          {setState.message}
        </AppText>
      ) : null}
    </Card>
  );
}

function FieldRow({
  error,
  keyboardType,
  label,
  onChangeText,
  placeholder,
  value,
}: {
  error?: string | undefined;
  keyboardType: 'number-pad' | 'decimal-pad';
  label: string;
  onChangeText: (text: string) => void;
  placeholder: string;
  value: string;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        inputMode={keyboardType === 'number-pad' ? 'numeric' : 'decimal'}
        keyboardType={keyboardType}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colours.textTertiary}
        style={{
          borderColor: colours.border,
          borderRadius: radii.medium,
          borderWidth: 1,
          color: colours.textPrimary,
          minHeight: touchTargets.comfortable,
          paddingHorizontal: spacing.sm,
        }}
        value={value}
      />
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: colours.cautionText }}
          variant="caption"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
