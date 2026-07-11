import { TextInput, TextInputProps, View } from 'react-native';

import { AppText } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

type TextFieldProps = TextInputProps & {
  error?: string | undefined;
  label: string;
};

export function TextField({ error, label, style, ...props }: TextFieldProps) {
  const { colours, radii, spacing, touchTargets, typography } = useAppTheme();

  return (
    <View style={{ gap: spacing.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        accessibilityLabel={label}
        accessibilityState={{ disabled: props.editable === false }}
        allowFontScaling
        placeholderTextColor={colours.textTertiary}
        {...props}
        style={[
          typography.body,
          {
            backgroundColor: colours.surfaceMuted,
            borderColor: error ? colours.dangerText : colours.border,
            borderRadius: radii.medium,
            borderWidth: 1,
            color: colours.textPrimary,
            minHeight: touchTargets.comfortable,
            paddingHorizontal: spacing.md,
            paddingVertical: spacing.sm,
          },
          style,
        ]}
      />
      {error ? (
        <AppText
          accessibilityLiveRegion="polite"
          style={{ color: colours.dangerText }}
          variant="caption"
        >
          {error}
        </AppText>
      ) : null}
    </View>
  );
}
