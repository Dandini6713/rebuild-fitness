// Presentational rendering of the weekly alcohol summary (docs/06 §6.9). Pure in its props
// — it takes the resolved state, not the hook — so every state is testable without Supabase
// or auth (mirrors FoodDiaryView and MeasurementHistoryView).
//
// TONE IS A HARD REQUIREMENT (docs/07 §7.4, the roadmap-20 brief). This is a NEUTRAL
// tracker. It shows EXACTLY the five docs/06 §6.9 metrics — total drinks, total units,
// estimated calories, alcohol-free days, and percentage of personal limit (only when a
// limit is set) — presented plainly. There is deliberately:
//   • no "too much"/"over limit"/"well done" language and no colour-coded warning — the
//     percentage-of-limit figure is INFORMATION, never a cap or a warning;
//   • no praise for alcohol-free days and no guilt for drinks;
//   • NO compensatory suggestion of any kind (no fasting, meal-skipping, dehydration or
//     "earn it back" exercise — forbidden by docs/06 §6.9).
// The empty state (no drinks) is neutral and factual, never congratulatory. Any copy that
// nudges behaviour would be a bug.

import { View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
} from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import type { AlcoholSummaryState } from './useAlcoholSummary';

const integer = new Intl.NumberFormat('en-GB');
const oneDecimal = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
});

export function WeeklyAlcoholSummaryView({
  state,
}: {
  state: AlcoholSummaryState;
}) {
  const { spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your weekly summary…"
        label="Loading your weekly summary"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Your summary is unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} title="Can't load your summary" />
    );
  }

  const { recent, summary } = state.data;

  return (
    <View style={{ gap: spacing.lg }}>
      <Card
        accessibilityLabel={`Last ${summary.daysInWindow} days: ${summary.totalDrinks} drinks, ${oneDecimal.format(
          summary.totalUnits,
        )} units, ${integer.format(summary.totalCalories)} estimated calories, ${summary.alcoholFreeDays} alcohol-free days.`}
      >
        <AppText variant="heading">{`Last ${summary.daysInWindow} days`}</AppText>
        <AppText tone="secondary" variant="caption">
          Estimated figures, for your record.
        </AppText>
        <View style={{ gap: spacing.sm }}>
          <Metric label="Drinks" value={integer.format(summary.totalDrinks)} />
          <Metric label="Units" value={oneDecimal.format(summary.totalUnits)} />
          <Metric
            label="Estimated calories"
            value={`${integer.format(summary.totalCalories)} kcal`}
          />
          <Metric
            label="Alcohol-free days"
            value={`${summary.alcoholFreeDays} of ${summary.daysInWindow}`}
          />
          {summary.percentOfLimit !== null &&
          summary.weeklyLimitUnits !== null ? (
            <Metric
              label="Of your weekly limit"
              value={`${summary.percentOfLimit}% of ${oneDecimal.format(
                summary.weeklyLimitUnits,
              )} units`}
            />
          ) : null}
        </View>
        {summary.weeklyLimitUnits === null ? (
          <AppText tone="secondary" variant="caption">
            Set a personal weekly limit to see it as a percentage. It is your
            own figure, for information only.
          </AppText>
        ) : null}
      </Card>

      {recent.length === 0 ? (
        <EmptyState
          description="Nothing recorded in this period. Anything you log will be totalled here."
          title="No drinks recorded"
        />
      ) : (
        <Card>
          <AppText variant="heading">Recent drinks</AppText>
          {recent.map((drink) => (
            <View
              key={drink.id}
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                justifyContent: 'space-between',
              }}
            >
              <AppText style={{ flex: 1 }} variant="body">
                {drink.drinkName}
              </AppText>
              <AppText tone="secondary" variant="caption">
                {`${oneDecimal.format(drink.units)} units · ${integer.format(
                  drink.calories,
                )} kcal`}
              </AppText>
            </View>
          ))}
        </Card>
      )}
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View
      style={{
        flexDirection: 'row',
        gap: spacing.sm,
        justifyContent: 'space-between',
      }}
    >
      <AppText variant="label">{label}</AppText>
      <AppText variant="body">{value}</AppText>
    </View>
  );
}
