// The "record a drink" surface (docs/03 S-033): choose when, then either enter a drink
// manually (name, type, volume, ABV, calories, occasion note) or tap a saved favourite to
// log it in one action. Pure in its props — it takes the resolved favourites state and
// callbacks, not the hooks — so it is testable without Supabase or auth (mirrors
// FoodEntryView). Estimated UK units update live from the volume and ABV via the pure
// computeUnits, so the user sees the figure before saving (docs/03 S-033 "Show estimated
// UK units").
//
// TONE (docs/07 §7.4): a drink is NEUTRAL data. Copy is factual — it never frames a drink
// as a lapse, never praises abstaining, and NEVER suggests offsetting a drink with
// exercise, fasting or anything else. There is a plain "approximation" note on the units
// and calories, as docs/07 §7.4 requires, and nothing more.

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
import { computeUnits } from '@/domain/alcohol/alcoholUnits';
import { useAppTheme } from '@/theme/useAppTheme';

import type { DrinkFavouriteRecord } from './alcoholRepository';
import {
  type DrinkLogFieldErrors,
  type ValidatedDrinkLog,
  validateDrinkLog,
} from './alcoholSchema';
import type { DrinkFavouritesState } from './useDrinkFavourites';

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

const unitsFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
});

export type AlcoholLogViewProps = {
  now?: Date;
  favourites: DrinkFavouritesState;
  submitting: boolean;
  onLogDrink: (drink: ValidatedDrinkLog) => void;
  onLogFavourite: (input: {
    favourite: DrinkFavouriteRecord;
    loggedAtIso: string;
  }) => void;
  onCreateFavourite: () => void;
};

export function AlcoholLogView({
  favourites,
  now = new Date(),
  onCreateFavourite,
  onLogDrink,
  onLogFavourite,
  submitting,
}: AlcoholLogViewProps) {
  const { spacing } = useAppTheme();
  const [daysAgo, setDaysAgo] = useState<number>(0);

  const loggedAtIso = useMemo(
    () => dateDaysAgo(now, daysAgo).toISOString(),
    [now, daysAgo],
  );

  return (
    <View style={{ gap: spacing.lg }}>
      <Card>
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
                onPress={() => setDaysAgo(option)}
                selected={daysAgo === option}
              />
            ))}
          </View>
        </View>
      </Card>

      <DrinkForm
        now={now}
        onLog={onLogDrink}
        submitting={submitting}
        timeIso={loggedAtIso}
      />

      <FavouritePicker
        favourites={favourites}
        onCreateFavourite={onCreateFavourite}
        onLog={(favourite) => onLogFavourite({ favourite, loggedAtIso })}
      />
    </View>
  );
}

function DrinkForm({
  now,
  onLog,
  submitting,
  timeIso,
}: {
  now: Date;
  onLog: (drink: ValidatedDrinkLog) => void;
  submitting: boolean;
  timeIso: string;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const [drinkName, setDrinkName] = useState('');
  const [drinkType, setDrinkType] = useState('');
  const [volumeText, setVolumeText] = useState('');
  const [abvText, setAbvText] = useState('');
  const [caloriesText, setCaloriesText] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState<DrinkLogFieldErrors>({});

  const numberOrNull = (text: string): number | null => {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    const value = Number(trimmed);
    return Number.isFinite(value) ? value : Number.NaN;
  };

  // Live estimated units from the entered volume and ABV (docs/03 S-033). Only shown when
  // both are valid positive numbers; it is an estimate, plainly labelled.
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
    const result = validateDrinkLog(
      {
        abvPercent: numberOrNull(abvText),
        calories: numberOrNull(caloriesText),
        drinkName,
        drinkType: drinkType.trim() === '' ? undefined : drinkType,
        loggedAt: new Date(timeIso),
        occasionNote: note.trim() === '' ? undefined : note,
        volumeMl: numberOrNull(volumeText),
      },
      now,
    );
    if (!result.success) {
      setErrors(result.errors);
      return;
    }
    setErrors({});
    setDrinkName('');
    setDrinkType('');
    setVolumeText('');
    setAbvText('');
    setCaloriesText('');
    setNote('');
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
        description="Enter a drink. Estimated units are worked out from the volume and strength; calories are your own estimate."
        title="Record a drink"
      />

      <Field error={errors.drinkName} label="Drink name">
        <TextInput
          accessibilityLabel="Drink name"
          onChangeText={setDrinkName}
          placeholder="e.g. Lager"
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

      <Field error={errors.occasionNote} label="Occasion note (optional)">
        <TextInput
          accessibilityLabel="Occasion note"
          onChangeText={setNote}
          placeholder="e.g. With dinner"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={note}
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
    </Card>
  );
}

function FavouritePicker({
  favourites,
  onCreateFavourite,
  onLog,
}: {
  favourites: DrinkFavouritesState;
  onCreateFavourite: () => void;
  onLog: (favourite: DrinkFavouriteRecord) => void;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card>
      <SectionHeader
        description="Tap a saved drink to log it. Units are worked out from its volume and strength."
        title="Your saved drinks"
      />

      {favourites.status === 'loading' ? (
        <AppText tone="secondary">Loading your saved drinks…</AppText>
      ) : favourites.status === 'ready' ? (
        favourites.data.length === 0 ? (
          <AppText tone="secondary">
            You have not saved any drinks yet. Save one to log it in a single
            tap next time.
          </AppText>
        ) : (
          <View style={{ gap: spacing.xs }}>
            {favourites.data.map((favourite) => (
              <View
                key={favourite.id}
                style={{
                  alignItems: 'center',
                  flexDirection: 'row',
                  gap: spacing.sm,
                  justifyContent: 'space-between',
                }}
              >
                <View style={{ flex: 1 }}>
                  <AppText variant="body">{favourite.drinkName}</AppText>
                  <AppText tone="secondary" variant="caption">
                    {`${unitsFormat.format(favourite.volumeMl)} ml · ${unitsFormat.format(
                      favourite.abvPercent,
                    )}% · ${favourite.calories} kcal`}
                  </AppText>
                </View>
                <SecondaryButton
                  accessibilityLabel={`Log ${favourite.drinkName}`}
                  label="Log"
                  onPress={() => onLog(favourite)}
                />
              </View>
            ))}
          </View>
        )
      ) : (
        <StatusBadge
          label="Your saved drinks are unavailable right now"
          tone="info"
        />
      )}

      <SecondaryButton label="Save a new drink" onPress={onCreateFavourite} />
    </Card>
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
