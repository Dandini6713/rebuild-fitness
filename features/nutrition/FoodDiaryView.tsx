// Presentational rendering of the food diary (docs/03 S-031). Pure in its props — it
// takes the resolved state, not the hook — so every state is testable without Supabase or
// auth (mirrors TodayView and MeasurementHistoryView). British English throughout;
// nothing shame-based or appearance-insulting (docs/07).
//
// The diary shows the day's entries grouped by meal (breakfast, lunch, dinner, snacks)
// with per-meal calories and protein, the day's running totals, and — when a target is
// set — remaining calories and protein progress against it. With no target, totals show
// on their own rather than a meaningless "remaining".

import { View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  ProgressBar,
  StatusBadge,
} from '@/components/common';
import type { MealType } from '@/domain/nutrition/nutritionDiary';
import { useAppTheme } from '@/theme/useAppTheme';

import type { NutritionDiaryState } from './useNutritionDiary';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  dinner: 'Dinner',
  lunch: 'Lunch',
  snacks: 'Snacks',
};

const integer = new Intl.NumberFormat('en-GB');

function calorieText(value: number): string {
  return `${integer.format(Math.round(value))} kcal`;
}
function proteinText(value: number): string {
  return `${integer.format(Math.round(value))} g protein`;
}

export function FoodDiaryView({ state }: { state: NutritionDiaryState }) {
  const { spacing } = useAppTheme();

  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your diary…"
        label="Loading your diary"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Your diary is unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return (
      <ErrorState description={state.message} title="Can't load your diary" />
    );
  }

  const { caloriesProgress, proteinProgress, summary, target } = state.data;

  return (
    <View style={{ gap: spacing.lg }}>
      <TotalsCard
        caloriesProgress={caloriesProgress}
        proteinProgress={proteinProgress}
        target={target !== null}
        totalCalories={summary.totals.calories}
        totalProteinG={summary.totals.proteinG}
      />
      {summary.meals.length === 0 ? (
        <EmptyState
          description="Nothing logged yet today. Add a food or a quick entry and it will appear here, grouped by meal."
          title="Your diary is empty today"
        />
      ) : (
        summary.meals.map((meal) => (
          <Card
            accessibilityLabel={`${MEAL_LABELS[meal.mealType]}: ${calorieText(
              meal.calories,
            )}, ${proteinText(meal.proteinG)}.`}
            key={meal.mealType}
          >
            <View
              style={{
                flexDirection: 'row',
                gap: spacing.sm,
                justifyContent: 'space-between',
              }}
            >
              <AppText variant="heading">{MEAL_LABELS[meal.mealType]}</AppText>
              <AppText tone="secondary" variant="caption">
                {`${calorieText(meal.calories)} · ${proteinText(meal.proteinG)}`}
              </AppText>
            </View>
            {meal.entries.map((entry) => (
              <View
                key={entry.id}
                style={{
                  flexDirection: 'row',
                  gap: spacing.sm,
                  justifyContent: 'space-between',
                }}
              >
                <AppText style={{ flex: 1 }} variant="body">
                  {entry.description}
                </AppText>
                <AppText tone="secondary" variant="caption">
                  {`${integer.format(entry.calories)} kcal · ${integer.format(
                    Math.round(entry.proteinG),
                  )} g`}
                </AppText>
              </View>
            ))}
          </Card>
        ))
      )}
    </View>
  );
}

function TotalsCard({
  caloriesProgress,
  proteinProgress,
  target,
  totalCalories,
  totalProteinG,
}: {
  caloriesProgress: { percent: number; remaining: number } | null;
  proteinProgress: { percent: number } | null;
  target: boolean;
  totalCalories: number;
  totalProteinG: number;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card
      accessibilityLabel={`Today's totals: ${calorieText(totalCalories)}, ${proteinText(totalProteinG)}.`}
    >
      <AppText variant="heading">{"Today's totals"}</AppText>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">Calories</AppText>
        {caloriesProgress ? (
          <>
            <ProgressBar
              accessibilityLabel={`Calories: ${calorieText(totalCalories)} logged, ${integer.format(
                caloriesProgress.remaining,
              )} kcal remaining.`}
              value={caloriesProgress.percent}
            />
            <AppText tone="secondary" variant="caption">
              {`${calorieText(totalCalories)} logged · ${integer.format(
                caloriesProgress.remaining,
              )} kcal remaining`}
            </AppText>
          </>
        ) : (
          <AppText tone="secondary">
            {calorieText(totalCalories)} logged
          </AppText>
        )}
      </View>
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">Protein</AppText>
        {proteinProgress ? (
          <>
            <ProgressBar
              accessibilityLabel={`Protein: ${proteinText(totalProteinG)} of your target.`}
              value={proteinProgress.percent}
            />
            <AppText tone="secondary" variant="caption">
              {`${proteinText(totalProteinG)} logged`}
            </AppText>
          </>
        ) : (
          <AppText tone="secondary">
            {proteinText(totalProteinG)} logged
          </AppText>
        )}
      </View>
      {!target ? (
        <StatusBadge label="No target set — showing totals only" tone="info" />
      ) : null}
    </Card>
  );
}
