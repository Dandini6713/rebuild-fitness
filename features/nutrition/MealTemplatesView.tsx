// Saved meals (docs/05 §5.7): a reusable collection of foods and quantities that logs as
// a whole. Lists the user's saved meals (each loggable to a chosen meal in one tap) and
// offers a simple builder that assembles a meal from saved foods. Pure in its props — it
// takes the resolved states and callbacks, not the hooks — so it is testable without
// Supabase or auth. British English throughout.

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  PrimaryButton,
  SecondaryButton,
  SectionHeader,
  StatusBadge,
} from '@/components/common';
import { MEAL_TYPES, type MealType } from '@/domain/nutrition/nutritionDiary';
import { useAppTheme } from '@/theme/useAppTheme';

import type { FoodRecord, MealTemplateSummary } from './nutritionRepository';
import {
  type MealTemplateItemDraft,
  type ValidatedMealTemplate,
  validateMealTemplate,
} from './nutritionSchema';
import type { FoodLibraryState } from './useFoodLibrary';
import type { MealTemplatesState, SaveTemplateState } from './useMealTemplates';

const MEAL_LABELS: Record<MealType, string> = {
  breakfast: 'Breakfast',
  dinner: 'Dinner',
  lunch: 'Lunch',
  snacks: 'Snacks',
};

const integer = new Intl.NumberFormat('en-GB');

export type MealTemplatesViewProps = {
  now?: Date;
  state: MealTemplatesState;
  foods: FoodLibraryState;
  saveState: SaveTemplateState;
  logging: boolean;
  onLog: (input: {
    templateId: string;
    mealType: MealType;
    loggedAtIso: string;
  }) => void;
  onSave: (template: ValidatedMealTemplate) => void;
};

export function MealTemplatesView({
  foods,
  logging,
  now = new Date(),
  onLog,
  onSave,
  saveState,
  state,
}: MealTemplatesViewProps) {
  const { spacing } = useAppTheme();
  const [mealType, setMealType] = useState<MealType>('breakfast');

  return (
    <View style={{ gap: spacing.lg }}>
      <Card>
        <View
          accessibilityLabel="Log saved meals to which meal?"
          accessibilityRole="radiogroup"
          style={{ gap: spacing.xs }}
        >
          <AppText variant="label">Log to</AppText>
          <View
            style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}
          >
            {MEAL_TYPES.map((meal) => (
              <Chip
                key={meal}
                label={MEAL_LABELS[meal]}
                onPress={() => setMealType(meal)}
                selected={mealType === meal}
              />
            ))}
          </View>
        </View>
      </Card>

      <SavedMealsList
        logging={logging}
        onLog={(templateId) =>
          onLog({ loggedAtIso: now.toISOString(), mealType, templateId })
        }
        state={state}
      />

      <MealBuilder foods={foods} onSave={onSave} saveState={saveState} />
    </View>
  );
}

function SavedMealsList({
  logging,
  onLog,
  state,
}: {
  logging: boolean;
  onLog: (templateId: string) => void;
  state: MealTemplatesState;
}) {
  const { spacing } = useAppTheme();
  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your saved meals…"
        label="Loading saved meals"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Your saved meals are unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return <ErrorState description={state.message} />;
  }
  if (state.data.length === 0) {
    return (
      <EmptyState
        description="You have not saved any meals yet. Build one below from your foods to log it in a single tap next time."
        title="No saved meals yet"
      />
    );
  }
  return (
    <View style={{ gap: spacing.sm }}>
      <SectionHeader title="Your saved meals" />
      {state.data.map((template: MealTemplateSummary) => (
        <Card
          accessibilityLabel={`${template.name}: ${template.itemCount} items, ${integer.format(
            template.calories,
          )} kcal.`}
          key={template.id}
        >
          <AppText variant="heading">{template.name}</AppText>
          <AppText tone="secondary" variant="caption">
            {`${template.itemCount} item${template.itemCount === 1 ? '' : 's'} · ${integer.format(
              template.calories,
            )} kcal · ${integer.format(Math.round(template.proteinG))} g protein`}
          </AppText>
          <PrimaryButton
            accessibilityLabel={`Log ${template.name}`}
            label="Log this meal"
            loading={logging}
            onPress={() => onLog(template.id)}
          />
        </Card>
      ))}
    </View>
  );
}

function MealBuilder({
  foods,
  onSave,
  saveState,
}: {
  foods: FoodLibraryState;
  onSave: (template: ValidatedMealTemplate) => void;
  saveState: SaveTemplateState;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [name, setName] = useState('');
  const [items, setItems] = useState<MealTemplateItemDraft[]>([]);
  const [error, setError] = useState<string | undefined>(undefined);

  const totals = useMemo(() => {
    let calories = 0;
    let proteinG = 0;
    for (const item of items) {
      calories += Math.round(item.calories * item.servingQuantity);
      proteinG += item.proteinG * item.servingQuantity;
    }
    return { calories, proteinG: Math.round(proteinG * 100) / 100 };
  }, [items]);

  const addFood = (food: FoodRecord) => {
    setItems((prev) => [
      ...prev,
      {
        calories: food.calories,
        carbohydrateG: food.carbohydrateG,
        description: food.name,
        fatG: food.fatG,
        foodId: food.id,
        proteinG: food.proteinG,
        servingQuantity: 1,
      },
    ]);
  };
  const removeItem = (index: number) =>
    setItems((prev) => prev.filter((_, i) => i !== index));

  const handleSave = () => {
    const result = validateMealTemplate({ items, name });
    if (!result.success) {
      setError(
        result.errors.name ?? result.errors.items ?? 'Check the meal details.',
      );
      return;
    }
    setError(undefined);
    onSave(result.data);
    setName('');
    setItems([]);
  };

  return (
    <Card>
      <SectionHeader
        description="Give the meal a name and add foods to it. Saving keeps it for one-tap logging."
        title="Build a saved meal"
      />
      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">Meal name</AppText>
        <TextInput
          accessibilityLabel="Meal name"
          onChangeText={setName}
          placeholder="e.g. Usual breakfast"
          placeholderTextColor={colours.textTertiary}
          style={{
            borderColor: colours.border,
            borderRadius: radii.medium,
            borderWidth: 1,
            color: colours.textPrimary,
            minHeight: touchTargets.comfortable,
            paddingHorizontal: spacing.sm,
          }}
          value={name}
        />
      </View>

      {items.length > 0 ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Items</AppText>
          {items.map((item, index) => (
            <View
              key={`${item.description}-${index}`}
              style={{
                alignItems: 'center',
                flexDirection: 'row',
                gap: spacing.sm,
                justifyContent: 'space-between',
              }}
            >
              <AppText style={{ flex: 1 }} variant="body">
                {item.description}
              </AppText>
              <SecondaryButton
                accessibilityLabel={`Remove ${item.description}`}
                label="Remove"
                onPress={() => removeItem(index)}
              />
            </View>
          ))}
          <AppText tone="secondary" variant="caption">
            {`${integer.format(totals.calories)} kcal · ${integer.format(
              Math.round(totals.proteinG),
            )} g protein`}
          </AppText>
        </View>
      ) : (
        <AppText tone="secondary">
          Add foods from the list below to build this meal.
        </AppText>
      )}

      {foods.status === 'ready' ? (
        <View style={{ gap: spacing.xs }}>
          <AppText variant="label">Add from your foods</AppText>
          {foods.data.all.length === 0 ? (
            <AppText tone="secondary">
              You have no saved foods yet. Create a food first, then build a
              meal from your foods.
            </AppText>
          ) : (
            foods.data.all.map((food) => (
              <View
                key={food.id}
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: spacing.sm,
                  justifyContent: 'space-between',
                }}
              >
                <AppText style={{ flex: 1 }} variant="body">
                  {food.name}
                </AppText>
                <SecondaryButton
                  accessibilityLabel={`Add ${food.name}`}
                  label="Add"
                  onPress={() => addFood(food)}
                />
              </View>
            ))
          )}
        </View>
      ) : null}

      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: colours.cautionText }}
          variant="caption"
        >
          {error}
        </AppText>
      ) : null}

      <PrimaryButton
        label="Save meal"
        loading={saveState.status === 'submitting'}
        onPress={handleSave}
      />
      {saveState.status === 'saved' ? (
        <StatusBadge label="Meal saved" tone="success" />
      ) : null}
      {saveState.status === 'offline' ? (
        <AppText accessibilityLiveRegion="polite" variant="body">
          You appear to be offline, so this was not saved. Please try again when
          you are back online.
        </AppText>
      ) : null}
      {saveState.status === 'error' ? (
        <AppText accessibilityLiveRegion="assertive" variant="body">
          {saveState.message}
        </AppText>
      ) : null}
    </Card>
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
