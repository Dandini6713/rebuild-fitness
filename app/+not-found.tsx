import { Link } from 'expo-router';

import { AppScreen, AppText, Card } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

export default function NotFoundScreen() {
  const { colours, spacing, touchTargets } = useAppTheme();

  return (
    <AppScreen title="Page not found">
      <Card>
        <AppText tone="secondary">
          The page you tried to open is not available.
        </AppText>
        <Link
          accessibilityLabel="Return to Today"
          accessibilityRole="link"
          href="/(tabs)/today"
          style={{
            color: colours.accent,
            minHeight: touchTargets.minimum,
            paddingVertical: spacing.sm,
          }}
        >
          Return to Today
        </Link>
      </Card>
    </AppScreen>
  );
}
