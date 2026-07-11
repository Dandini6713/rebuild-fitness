import { PropsWithChildren, ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';

type AppScreenProps = PropsWithChildren<{
  eyebrow?: string;
  footer?: ReactNode;
  title: string;
}>;

export function AppScreen({
  children,
  eyebrow,
  footer,
  title,
}: AppScreenProps) {
  const { colours, spacing } = useAppTheme();

  return (
    <SafeAreaView
      edges={['top', 'left', 'right']}
      style={[styles.safeArea, { backgroundColor: colours.background }]}
    >
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { gap: spacing.lg, padding: spacing.lg },
        ]}
        contentInsetAdjustmentBehavior="automatic"
      >
        <View style={{ gap: spacing.xs }}>
          {eyebrow ? (
            <AppText tone="tertiary" variant="label">
              {eyebrow}
            </AppText>
          ) : null}
          <AppText accessibilityRole="header" variant="title">
            {title}
          </AppText>
        </View>
        {children}
      </ScrollView>
      {footer}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1 },
  content: { flexGrow: 1 },
});
