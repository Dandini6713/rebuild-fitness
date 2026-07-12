// A single-choice numeric scale for effort (1–10) and self-reported discomfort
// (0–10). Each value is a 44pt touch target; the chosen value is conveyed by a tick
// and a filled treatment *and* text, never colour alone (docs/09 §9.2/§9.8), and
// carries an accessible label and selected state so a screen reader announces both
// the number and that it is chosen. Endpoint captions ("None"/"Most") give the
// scale meaning without implying any diagnosis (docs/07).

import { Pressable, View } from 'react-native';

import { AppText } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

type ScaleSelectorProps = {
  label: string;
  min: number;
  max: number;
  value: number | null;
  onSelect: (value: number) => void;
  optionAccessibilityLabel: (value: number) => string;
  lowCaption: string;
  highCaption: string;
};

export function ScaleSelector({
  highCaption,
  label,
  lowCaption,
  max,
  min,
  onSelect,
  optionAccessibilityLabel,
  value,
}: ScaleSelectorProps) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const values: number[] = [];
  for (let current = min; current <= max; current += 1) {
    values.push(current);
  }

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs }}>
        {values.map((option) => {
          const selected = option === value;
          return (
            <Pressable
              accessibilityLabel={optionAccessibilityLabel(option)}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              key={option}
              onPress={() => onSelect(option)}
              style={{
                alignItems: 'center',
                backgroundColor: selected ? colours.accent : colours.surface,
                borderColor: selected ? colours.accent : colours.border,
                borderRadius: radii.medium,
                borderWidth: 1,
                flexDirection: 'row',
                gap: 2,
                justifyContent: 'center',
                minHeight: touchTargets.minimum,
                minWidth: touchTargets.minimum,
                paddingHorizontal: spacing.xs,
              }}
            >
              {selected ? (
                <AppText style={{ color: colours.onAccent }} variant="caption">
                  ✓
                </AppText>
              ) : null}
              <AppText
                style={{
                  color: selected ? colours.onAccent : colours.textPrimary,
                }}
                variant="label"
              >
                {option}
              </AppText>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <AppText tone="tertiary" variant="caption">
          {min} · {lowCaption}
        </AppText>
        <AppText tone="tertiary" variant="caption">
          {max} · {highCaption}
        </AppText>
      </View>
    </View>
  );
}
