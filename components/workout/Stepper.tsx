// A plus/minus stepper for a numeric workout value (weight, repetitions). The two
// buttons are 44pt minimum touch targets with their own accessible labels, and the
// whole control announces the current value, so a screen-reader user always hears
// what they are changing and to what (docs/09 accessibility; the brief calls the
// weight and rep steppers out specifically). Value and unit are conveyed as text.

import { Pressable, View } from 'react-native';

import { AppText } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

type StepperProps = {
  label: string;
  value: number;
  unit?: string;
  displayValue: string;
  decrementLabel: string;
  incrementLabel: string;
  onDecrement: () => void;
  onIncrement: () => void;
  disabled?: boolean;
};

export function Stepper({
  decrementLabel,
  disabled = false,
  displayValue,
  incrementLabel,
  label,
  onDecrement,
  onIncrement,
  unit,
  value,
}: StepperProps) {
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <View
        accessibilityLabel={`${label}: ${displayValue}${unit ? ` ${unit}` : ''}`}
        accessibilityRole="adjustable"
        accessibilityValue={{ now: value, text: displayValue }}
        style={{
          alignItems: 'center',
          flexDirection: 'row',
          gap: spacing.md,
          justifyContent: 'space-between',
        }}
      >
        <StepButton
          accessibilityLabel={decrementLabel}
          disabled={disabled}
          onPress={onDecrement}
          symbol="−"
        />
        <View style={{ alignItems: 'center', flex: 1 }}>
          <AppText variant="heading">
            {displayValue}
            {unit ? ` ${unit}` : ''}
          </AppText>
        </View>
        <StepButton
          accessibilityLabel={incrementLabel}
          disabled={disabled}
          onPress={onIncrement}
          symbol="+"
        />
      </View>
    </View>
  );
}

function StepButton({
  accessibilityLabel,
  disabled,
  onPress,
  symbol,
}: {
  accessibilityLabel: string;
  disabled: boolean;
  onPress: () => void;
  symbol: string;
}) {
  const { colours, radii, touchTargets } = useAppTheme();
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        alignItems: 'center',
        backgroundColor: pressed ? colours.surfaceMuted : colours.surface,
        borderColor: colours.border,
        borderRadius: radii.medium,
        borderWidth: 1,
        height: touchTargets.comfortable,
        justifyContent: 'center',
        opacity: disabled ? 0.5 : 1,
        width: touchTargets.comfortable,
      })}
    >
      <AppText style={{ color: colours.accent }} variant="title">
        {symbol}
      </AppText>
    </Pressable>
  );
}
