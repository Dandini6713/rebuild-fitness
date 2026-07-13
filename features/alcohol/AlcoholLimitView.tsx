// The personal weekly unit-limit editor (docs/06 §6.9, docs/07 §7.4). Pure in its props —
// it takes the resolved load/save state and callbacks, not the hooks. The limit is the
// user's OWN figure, stored to drive the informational percentage-of-limit summary metric;
// it is NOT a cap, a warning threshold or a target the app pushes toward. There is no
// suggested value and no default — the user chooses it, or leaves it unset (in which case
// the percentage metric is simply not shown).
//
// A fuller settings surface is a noted seam (there is no settings screen yet); this minimal
// editor lives in the alcohol screens so the metric is usable.

import { useState } from 'react';
import { TextInput, View } from 'react-native';

import { AppText, Card, PrimaryButton, StatusBadge } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import { validateWeeklyLimit } from './alcoholSchema';
import type {
  AlcoholLimitLoadState,
  AlcoholLimitSaveState,
} from './useAlcoholLimit';

const unitsFormat = new Intl.NumberFormat('en-GB', {
  maximumFractionDigits: 2,
});

export type AlcoholLimitViewProps = {
  loadState: AlcoholLimitLoadState;
  saveState: AlcoholLimitSaveState;
  onSave: (units: number) => void;
};

export function AlcoholLimitView({
  loadState,
  onSave,
  saveState,
}: AlcoholLimitViewProps) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  // The field starts empty with the current value shown above it, so entering a new limit
  // is always a deliberate act (and there is never a stale value seeded into the input).
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = () => {
    const trimmed = text.trim();
    const value = trimmed === '' ? null : Number(trimmed);
    const result = validateWeeklyLimit({
      units: value !== null && Number.isFinite(value) ? value : Number.NaN,
    });
    if (!result.success) {
      setError(result.error);
      return;
    }
    setError(null);
    onSave(result.data.units);
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
      <AppText variant="heading">Weekly limit</AppText>
      <AppText tone="secondary" variant="body">
        Set your own weekly limit in units. It is used only to show your weekly
        total as a percentage — it is information for you, not a cap.
      </AppText>

      {loadState.status === 'loading' ? (
        <AppText tone="secondary">Loading your limit…</AppText>
      ) : loadState.status === 'ready' && loadState.units !== null ? (
        <AppText tone="secondary" variant="caption">
          {`Your current limit is ${unitsFormat.format(loadState.units)} units.`}
        </AppText>
      ) : loadState.status === 'ready' ? (
        <AppText tone="secondary" variant="caption">
          You have not set a limit yet.
        </AppText>
      ) : null}

      <View style={{ gap: spacing.xs }}>
        <AppText variant="label">Weekly limit (units)</AppText>
        <TextInput
          accessibilityLabel="Weekly limit in units"
          inputMode="decimal"
          keyboardType="decimal-pad"
          onChangeText={setText}
          placeholder="units"
          placeholderTextColor={colours.textTertiary}
          style={input}
          value={text}
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

      {saveState.status === 'saved' ? (
        <StatusBadge label="Weekly limit saved" tone="success" />
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

      <PrimaryButton
        label="Save limit"
        loading={saveState.status === 'submitting'}
        onPress={handleSubmit}
      />
    </Card>
  );
}
