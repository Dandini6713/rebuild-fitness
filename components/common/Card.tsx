import { PropsWithChildren } from 'react';
import { StyleProp, View, ViewProps, ViewStyle } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

type CardProps = PropsWithChildren<
  ViewProps & { style?: StyleProp<ViewStyle> }
>;

export function Card({ children, style, ...props }: CardProps) {
  const { colours, isDark, radii, shadows, spacing } = useAppTheme();

  return (
    <View
      {...props}
      style={[
        {
          backgroundColor: colours.surface,
          borderColor: colours.borderSubtle,
          borderRadius: radii.large,
          borderWidth: 1,
          gap: spacing.md,
          padding: spacing.lg,
          shadowColor: colours.shadow,
        },
        isDark ? shadows.none : shadows.card,
        style,
      ]}
    >
      {children}
    </View>
  );
}
