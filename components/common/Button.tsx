import { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
} from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';

type ButtonProps = Omit<PressableProps, 'children'> & {
  icon?: ReactNode;
  label: string;
  loading?: boolean;
};

function AppButton({
  disabled,
  icon,
  label,
  loading = false,
  variant,
  ...props
}: ButtonProps & { variant: 'primary' | 'secondary' }) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      {...props}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor:
            variant === 'primary'
              ? pressed
                ? colours.accentPressed
                : colours.accent
              : pressed
                ? colours.surfaceMuted
                : colours.surface,
          borderColor: variant === 'primary' ? colours.accent : colours.border,
          borderRadius: radii.medium,
          gap: spacing.xs,
          minHeight: touchTargets.comfortable,
          opacity: isDisabled ? 0.5 : 1,
          paddingHorizontal: spacing.lg,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator
          color={variant === 'primary' ? colours.onAccent : colours.accent}
        />
      ) : null}
      {!loading && icon ? (
        <View accessibilityElementsHidden>{icon}</View>
      ) : null}
      <AppText
        style={{
          color: variant === 'primary' ? colours.onAccent : colours.accent,
        }}
        variant="label"
      >
        {loading ? `${label}…` : label}
      </AppText>
    </Pressable>
  );
}

export function PrimaryButton(props: ButtonProps) {
  return <AppButton {...props} variant="primary" />;
}

export function SecondaryButton(props: ButtonProps) {
  return <AppButton {...props} variant="secondary" />;
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderWidth: 1,
    flexDirection: 'row',
    justifyContent: 'center',
  },
});
