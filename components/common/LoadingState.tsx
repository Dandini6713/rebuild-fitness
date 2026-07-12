// Shared loading state. Announces itself to assistive technology as a busy
// progress indicator (docs/09 §9.8) and pairs the spinner with text, so status
// never depends on the animation alone.

import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';

type LoadingStateProps = { description?: string; label: string };

export function LoadingState({ description, label }: LoadingStateProps) {
  const { colours, spacing } = useAppTheme();

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="progressbar"
      accessibilityState={{ busy: true }}
      style={{
        alignItems: 'center',
        gap: spacing.md,
        paddingVertical: spacing.xl,
      }}
    >
      <ActivityIndicator color={colours.accent} size="large" />
      <AppText tone="secondary">{description ?? label}</AppText>
    </View>
  );
}
