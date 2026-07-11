import { PropsWithChildren } from 'react';
import { StyleProp, Text, TextProps, TextStyle } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

type AppTextVariant =
  'display' | 'title' | 'heading' | 'body' | 'label' | 'caption';
type AppTextTone = 'primary' | 'secondary' | 'tertiary' | 'disabled';

type AppTextProps = PropsWithChildren<
  TextProps & {
    style?: StyleProp<TextStyle>;
    tone?: AppTextTone;
    variant?: AppTextVariant;
  }
>;

export function AppText({
  children,
  style,
  tone = 'primary',
  variant = 'body',
  ...props
}: AppTextProps) {
  const { colours, typography } = useAppTheme();
  const tones = {
    disabled: colours.textDisabled,
    primary: colours.textPrimary,
    secondary: colours.textSecondary,
    tertiary: colours.textTertiary,
  };

  return (
    <Text
      allowFontScaling
      {...props}
      style={[typography[variant], { color: tones[tone] }, style]}
    >
      {children}
    </Text>
  );
}
