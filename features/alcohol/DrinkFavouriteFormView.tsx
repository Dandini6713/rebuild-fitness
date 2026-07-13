// The save-a-drink form (docs/03 S-033, the reusable favourite — the foods parallel for
// alcohol): name, type, volume, ABV and calories, saved once and reused as a one-tap log.
// Produces a validated favourite for the parent to save (mirrors FoodFormView — the view
// owns Zod validation and hands only valid values up). Estimated units update live from
// the volume and ABV (docs/03 S-033). British English throughout; a drink is neutral data,
// so nothing here judges or prescribes.

import { useMemo, useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText, PrimaryButton, SectionHeader } from '@/components/common';
import { computeUnits } from '@/domain/alcohol/alcoholUnits';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  type DrinkFavouriteFieldErrors,
  type ValidatedDrinkFavourite,
  validateDrinkFavourite,
} from './alcoholSchema';

const unitsFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
});

export type DrinkFavouriteFormViewProps = {
  submitting: boolean;
  onSubmit: (favourite: ValidatedDrinkFavourite) => void;
};

export function DrinkFavouriteFormView({
  onSubmit,
  submitting,
}: DrinkFavouriteFormViewProps) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [drinkName, setDrinkName] = useState('');
  const [drinkType, setDrinkType] = useState('');
  const [volumeText, setVolumeText] = useState('');
  const [abvText, setAbvText] = useState('');
  const [caloriesText, setCaloriesText] = useState('');
  const [errors, setErrors] = useState<DrinkFavouriteFieldErrors>({});

  const numberOrNull = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : Number.NaN;
  };

  const previewUnits = useMemo(() => {
    const volume = Number(volumeText.trim());
    const abv = Number(abvText.trim());
    if (
      volumeText.trim() === '' ||
      abvText.trim() === '' ||
      !Number.isFinite(volume) ||
      !Number.isFinite(abv) ||
      volume <= 0 ||
      abv < 0
    ) {
      return null;
    }
    return computeUnits(volume, abv);
  }, [volumeText, abvText]);

  const handleSubmit = () => {
    const result = validateDrinkFavourite({
      abvPercent: numberOrNull(abvText),
      calories: numberOrNull(caloriesText),
      drinkName,
      drinkType: drinkType.trim() === '' ? undefined : drinkType,
      volumeMl: numberOrNull(volumeText),
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
        description="Save a drink once and log it in a single tap. Estimated units come from the volume and strength."
        title="Save a drink"
      />

      <Field error={errors.drinkName} label="Drink name">
        <TextInput
          accessibilityLabel="Drink name"
          onChangeText={setDrinkName}
          placeholder="e.g. Pint of lager"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={drinkName}
        />
      </Field>

      <Field error={errors.drinkType} label="Type (optional)">
        <TextInput
          accessibilityLabel="Drink type"
          onChangeText={setDrinkType}
          placeholder="e.g. Beer, wine, spirit"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={drinkType}
        />
      </Field>

      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        <View style={{ flex: 1 }}>
          <Field error={errors.volumeMl} label="Volume (ml)">
            <TextInput
              accessibilityLabel="Volume in millilitres"
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setVolumeText}
              placeholder="ml"
              placeholderTextColor={colours.textTertiary}
              style={input}
              value={volumeText}
            />
          </Field>
        </View>
        <View style={{ flex: 1 }}>
          <Field error={errors.abvPercent} label="ABV (%)">
            <TextInput
              accessibilityLabel="ABV percentage"
              inputMode="decimal"
              keyboardType="decimal-pad"
              onChangeText={setAbvText}
              placeholder="%"
              placeholderTextColor={colours.textTertiary}
              style={input}
              value={abvText}
            />
          </Field>
        </View>
      </View>

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

      {previewUnits !== null ? (
        <AppText
          accessibilityLabel={`Estimated ${unitsFormat.format(previewUnits)} units`}
          tone="secondary"
          variant="caption"
        >
          {`Estimated ${unitsFormat.format(previewUnits)} units (approximate)`}
        </AppText>
      ) : null}

      <PrimaryButton
        label="Save drink"
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
