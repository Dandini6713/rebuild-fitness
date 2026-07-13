// The "add to your diary" surface (docs/03 S-031 MVP entry methods): choose a meal and
// time, then either log a quick calories-and-protein entry or tap a recent, favourite or
// saved food to log it (with a servings multiplier that scales its macros). Pure in its
// props — it takes the resolved food-library state and callbacks, not the hooks — so it is
// testable without Supabase or auth. British English throughout; neutral, non-judgemental
// copy (docs/07).

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import {
  AppText,
  Card,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from '@/components/common';
import { MEAL_TYPES, type MealType } from '@/domain/nutrition/nutritionDiary';
import { useAppTheme } from '@/theme/useAppTheme';

import type { FoodRecord, RecentFood } from './nutritionRepository';
import {
  type QuickEntryFieldErrors,
  type ValidatedQuickEntry,
  validateQuickEntry,
} from './nutritionSchema';
import type { FoodLibraryState } from './useFoodLibrary';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  dinner: 'Dinner',
  lunch: 'Lunch',
  snacks: 'Snacks',
};

const DAY_OPTIONS = [0, 1, 2] as const;
function dayLabel(daysAgo: number): string {
  if (daysAgo === 0) return 'Today';
  if (daysAgo === 1) return 'Yesterday';
  return `${daysAgo} days ago`;
}
function dateDaysAgo(now: Date, daysAgo: number): Date {
  const date = new Date(now.getTime());
  date.setDate(date.getDate() - daysAgo);
  return date;
}
function roundToTwo(value: number): number {
  return Math.round(value * 100) / 100;
}

export type FoodEntryViewProps = {
  now?: Date;
  foods: FoodLibraryState;
  submitting: boolean;
  onLogQuickEntry: (entry: ValidatedQuickEntry) => void;
  onLogFood: (input: {
    food: FoodRecord;
    mealType: MealType;
    loggedAtIso: string;
    servingQuantity: number;
  }) => void;
  onCreateFood: () => void;
  onOpenSavedMeals: () => void;
};

export function FoodEntryView({
  foods,
  now = new Date(),
  onCreateFood,
  onLogFood,
  onLogQuickEntry,
  onOpenSavedMeals,
  submitting,
}: FoodEntryViewProps) {
  const { spacing } = useAppTheme();
  const [mealType, setMealType] = useState<MealType>('breakfast');
  const [daysAgo, setDaysAgo] = useState<number>(0);

  const loggedAtIso = useMemo(
    () => dateDaysAgo(now, daysAgo).toISOString(),
    [now, daysAgo],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <MealAndTime
        daysAgo={daysAgo}
        mealType={mealType}
        onSelectDay={setDaysAgo}
        onSelectMeal={setMealType}
      />

      <QuickEntry
        mealType={mealType}
        now={now}
        onLog={onLogQuickEntry}
        submitting={submitting}
        timeIso={loggedAtIso}
      />

      <FoodPicker
        foods={foods}
        onCreateFood={onCreateFood}
        onLog={(food, servingQuantity) =>
          onLogFood({ food, loggedAtIso, mealType, servingQuantity })
        }
        onOpenSavedMeals={onOpenSavedMeals}
      />
    </View>
  );
}

function MealAndTime({
  daysAgo,
  mealType,
  onSelectDay,
  onSelectMeal,
}: {
  daysAgo: number;
  mealType: MealType;
  onSelectDay: (daysAgo: number) => void;
  onSelectMeal: (meal: MealType) => void;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card>
      <View
        accessibilityLabel="Which meal?"
        accessibilityRole="radiogroup"
        style={{ gap: spacing.xs }}
      >
        <AppText variant="label">Meal</AppText>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
        >
          {MEAL_TYPES.map((meal) => (
            <Chip
              key={meal}
              label={MEAL_LABELS[meal]}
              onPress={() => onSelectMeal(meal)}
              selected={mealType === meal}
            />
          ))}
        </View>
      </View>
      <View
        accessibilityLabel="When?"
        accessibilityRole="radiogroup"
        style={{ gap: spacing.xs }}
      >
        <AppText variant="label">When</AppText>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
        >
          {DAY_OPTIONS.map((option) => (
            <Chip
              key={`day-${option}`}
              label={dayLabel(option)}
              onPress={() => onSelectDay(option)}
              selected={daysAgo === option}
            />
          ))}
        </View>
      </View>
    </Card>
  );
}

function QuickEntry({
  mealType,
  now,
  onLog,
  submitting,
  timeIso,
}: {
  mealType: MealType;
  now: Date;
  onLog: (entry: ValidatedQuickEntry) => void;
  submitting: boolean;
  timeIso: string;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [description, setDescription] = useState('');
  const [caloriesText, setCaloriesText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [errors, setErrors] = useState<QuickEntryFieldErrors>({});

  const numberOrNull = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : Number.NaN;
  };

  const handleSubmit = () => {
    const result = validateQuickEntry(
      {
        calories: numberOrNull(caloriesText),
        description,
        loggedAt: new Date(timeIso),
        mealType,
        proteinG: numberOrNull(proteinText),
      },
      now,
    );
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setDescription('');
    setCaloriesText('');
    setProteinText('');
    onLog(result.data);
  };

  const input = {
    borderColor: colours.border,
    borderRadius: radii.medium,
    borderWidth: 1,
    color: colours.textPrimary,
    minHeight: touchTargets.comfortable,
    paddingHorizontal: spacing.sm,
  } as const;

  return (
    <Card>
      <SectionHeader
        description="Just calories and protein — the quickest way to keep your day accurate."
        title="Quick entry"
      />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">Name</AppText>
        <TextInput
          accessibilityLabel="Entry name"
          onChangeText={setDescription}
          placeholder="e.g. Flat white"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={description}
        />
        {errors.description ? (
          <AppText style={{ color: colours.cautionText }} variant="caption">
            {errors.description}
          </AppText>
        ) : null}
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label">Calories</AppText>
          <TextInput
            accessibilityLabel="Calories in kcal"
            inputMode="numeric"
            keyboardType="number-pad"
            onChangeText={setCaloriesText}
            placeholder="kcal"
            placeholderTextColor={colours.textTertiary}
            style={input}
            value={caloriesText}
          />
        </View>
        <View style={{ flex: 1, gap: spacing.xs }}>
          <AppText variant="label">Protein (g)</AppText>
          <TextInput
            accessibilityLabel="Protein in grams"
            inputMode="decimal"
            keyboardType="decimal-pad"
            onChangeText={setProteinText}
            placeholder="g"
            placeholderTextColor={colours.textTertiary}
            style={input}
            value={proteinText}
          />
        </View>
      </View>
      {errors.calories ? (
        <AppText style={{ color: colours.cautionText }} variant="caption">
          {errors.calories}
        </AppText>
      ) : null}
      {errors.proteinG ? (
        <AppText style={{ color: colours.cautionText }} variant="caption">
          {errors.proteinG}
        </AppText>
      ) : null}
      <PrimaryButton
        label="Add quick entry"
        loading={submitting}
        onPress={handleSubmit}
      />
    </Card>
  );
}

function FoodPicker({
  foods,
  onCreateFood,
  onLog,
  onOpenSavedMeals,
}: {
  foods: FoodLibraryState;
  onCreateFood: () => void;
  onLog: (food: FoodRecord, servingQuantity: number) => void;
  onOpenSavedMeals: () => void;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [servings, setServings] = useState(1);

  const adjust = (delta: number) =>
    setServings((prev) => Math.max(0.25, roundToTwo(prev + delta)));

  return (
    <Card>
      <SectionHeader
        description="Tap a food to log it. The servings control scales its calories and protein."
        title="Your foods"
      />

      <View
        style={{ alignItems: 'center', flexDirection: 'row', gap: spacing.sm }}
      >
        <AppText variant="label">Servings</AppText>
        <AppText
          accessibilityLabel="Fewer servings"
          accessibilityRole="button"
          onPress={() => adjust(-0.5)}
          style={{
            borderColor: colours.border,
            borderRadius: radii.medium,
            borderWidth: 1,
            minWidth: touchTargets.minimum,
            overflow: 'hidden',
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            textAlign: 'center',
          }}
          variant="title"
        >
          −
        </AppText>
        <AppText accessibilityLabel={`${servings} servings`} variant="body">
          {servings}
        </AppText>
        <AppText
          accessibilityLabel="More servings"
          accessibilityRole="button"
          onPress={() => adjust(0.5)}
          style={{
            borderColor: colours.border,
            borderRadius: radii.medium,
            borderWidth: 1,
            minWidth: touchTargets.minimum,
            overflow: 'hidden',
            paddingHorizontal: spacing.sm,
            paddingVertical: spacing.xs,
            textAlign: 'center',
          }}
          variant="title"
        >
          +
        </AppText>
      </View>

      {foods.status === 'loading' ? (
        <AppText tone="secondary">Loading your foods…</AppText>
      ) : foods.status === 'ready' ? (
        <FoodLists data={foods.data} onLog={(food) => onLog(food, servings)} />
      ) : (
        <StatusBadge label="Your foods are unavailable right now" tone="info" />
      )}

      <View style={{ gap: spacing.xs }}>
        <SecondaryButton label="Create a new food" onPress={onCreateFood} />
        <SecondaryButton label="Log a saved meal" onPress={onOpenSavedMeals} />
      </View>
    </Card>
  );
}

function FoodLists({
  data,
  onLog,
}: {
  data: { all: FoodRecord[]; favourites: FoodRecord[]; recent: RecentFood[] };
  onLog: (food: FoodRecord) => void;
}) {
  const { spacing } = useAppTheme();
  if (data.all.length === 0 && data.recent.length === 0) {
    return (
      <AppText tone="secondary">
        You have not saved any foods yet. Use a quick entry above, or create a
        food to reuse.
      </AppText>
    );
  }
  return (
    <View style={{ gap: spacing.md }}>
      {data.favourites.length > 0 ? (
        <FoodGroup foods={data.favourites} onLog={onLog} title="Favourites" />
      ) : null}
      {data.all.length > 0 ? (
        <FoodGroup foods={data.all} onLog={onLog} title="All foods" />
      ) : null}
    </View>
  );
}

function FoodGroup({
  foods,
  onLog,
  title,
}: {
  foods: FoodRecord[];
  onLog: (food: FoodRecord) => void;
  title: string;
}) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{title}</AppText>
      {foods.map((food) => (
        <View
          key={food.id}
          style={{
            alignItems: 'center',
            flexDirection: 'row',
            gap: spacing.sm,
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flex: 1 }}>
            <AppText variant="body">{food.name}</AppText>
            <AppText tone="secondary" variant="caption">
              {`${food.calories} kcal · ${Math.round(food.proteinG)} g protein${
                food.servingDescription ? ` · ${food.servingDescription}` : ''
              }`}
            </AppText>
          </View>
          <SecondaryButton
            accessibilityLabel={`Log ${food.name}`}
            label="Log"
            onPress={() => onLog(food)}
          />
        </View>
      ))}
    </View>
  );
}

function Chip({
  label,
  onPress,
  selected,
}: {
  label: string;
  onPress: () => void;
  selected: boolean;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  return (
    <AppText
      accessibilityLabel={label}
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
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
      {label}
    </AppText>
  );
}
