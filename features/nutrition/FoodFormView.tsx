// The add-a-food form (docs/03 S-032): name, serving description, calories, protein and
// optional carbohydrate and fat, with a favourite toggle. Produces a validated food for
// the parent to save (mirrors MeasurementFormView — the view owns Zod validation and hands
// only valid values up). British English throughout; a food is neutral data.

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText, PrimaryButton, SectionHeader } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  type FoodFieldErrors,
  type ValidatedFood,
  validateFood,
} from './nutritionSchema';

export type FoodFormViewProps = {
  submitting: boolean;
  onSubmit: (food: ValidatedFood) => void;
};

export function FoodFormView({ onSubmit, submitting }: FoodFormViewProps) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [name, setName] = useState('');
  const [serving, setServing] = useState('');
  const [caloriesText, setCaloriesText] = useState('');
  const [proteinText, setProteinText] = useState('');
  const [carbText, setCarbText] = useState('');
  const [fatText, setFatText] = useState('');
  const [favourite, setFavourite] = useState(false);
  const [errors, setErrors] = useState<FoodFieldErrors>({});

  const optionalNumber = (text: string): number | null | undefined => {
    const trimmed = text.trim();
    if (trimmed === '') return undefined;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : Number.NaN;
  };
  const requiredNumber = useMemo(
    () =>
      (text: string): number | null => {
        const trimmed = text.trim();
        if (trimmed === '') return null;
        const value = Number(trimmed);
        return Number.isFinite(value) ? value : Number.NaN;
      },
    [],
  );

  const handleSubmit = () => {
    const result = validateFood({
      calories: requiredNumber(caloriesText),
      carbohydrateG: optionalNumber(carbText),
      fatG: optionalNumber(fatText),
      favourite,
      name,
      proteinG: requiredNumber(proteinText),
      servingDescription: serving,
    });
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    onSubmit(result.data);
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
    <View style={{ gap: spacing.md }}>
      <SectionHeader
        description="Save a food once and reuse it. Calories and protein are required; carbohydrate and fat are optional."
        title="Add a food"
      />

      <Field error={errors.name} label="Name">
        <TextInput
          accessibilityLabel="Food name"
          onChangeText={setName}
          placeholder="e.g. Porridge with milk"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={name}
        />
      </Field>

      <Field error={errors.servingDescription} label="Serving (optional)">
        <TextInput
          accessibilityLabel="Serving description"
          onChangeText={setServing}
          placeholder="e.g. 1 bowl (60 g oats)"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={serving}
        />
      </Field>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field error={errors.calories} label="Calories">
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
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field error={errors.proteinG} label="Protein (g)">
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
          </Field>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field
            error={errors.carbohydrateG}
            label="Carbohydrate (g, optional)"
          >
            <TextInput
              accessibilityLabel="Carbohydrate in grams"
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setCarbText}
              placeholder="g"
              placeholderTextColor={colours.textTertiary}
              style={input}
              value={carbText}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field error={errors.fatG} label="Fat (g, optional)">
            <TextInput
              accessibilityLabel="Fat in grams"
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setFatText}
              placeholder="g"
              placeholderTextColor={colours.textTertiary}
              style={input}
              value={fatText}
            />
          </Field>
        </View>
      </View>

      <AppText
        accessibilityLabel="Mark as favourite"
        accessibilityRole="checkbox"
        accessibilityState={{ checked: favourite }}
        onPress={() => setFavourite((prev) => !prev)}
        variant="body"
      >
        {favourite ? '★ Favourite' : '☆ Mark as favourite'}
      </AppText>

      <PrimaryButton
        label="Save food"
        loading={submitting}
        onPress={handleSubmit}
      />
    </View>
  );
}

function Field({
  children,
  error,
  label,
}: {
  children: React.ReactNode;
  error?: string | undefined;
  label: string;
}) {
  const { colours, spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      {children}
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
