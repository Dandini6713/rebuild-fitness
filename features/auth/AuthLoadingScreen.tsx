import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

export function AuthLoadingScreen() {
  const { colours, spacing } = useAppTheme();

  return (
    <View
      accessibilityLabel="Restoring your secure session"
      accessibilityRole="progressbar"
      style={{
        alignItems: 'center',
        backgroundColor: colours.background,
        flex: 1,
        gap: spacing.md,
        justifyContent: 'center',
        padding: spacing.lg,
      }}
    >
      <ActivityIndicator color={colours.accent} size="large" />
      <AppText tone="secondary">Restoring your secure session…</AppText>
    </View>
  );
}
