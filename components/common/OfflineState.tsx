// Shared offline state, driven by useNetworkStatus. Like ErrorState it conveys
// status by icon and text (docs/09 §9.2), but the informational tone and polite
// live region reflect that being offline is a normal, recoverable condition
// rather than a failure. Default copy is British English; screens may override
// it to describe what specifically is unavailable while offline.

import { View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

type OfflineStateProps = { description?: string; title?: string };

const DEFAULT_TITLE = 'You appear to be offline';
const DEFAULT_DESCRIPTION =
  'Check your connection to see the latest. Anything you have already opened stays available, and new information will load once you are back online.';

export function OfflineState({
  description = DEFAULT_DESCRIPTION,
  title = DEFAULT_TITLE,
}: OfflineStateProps) {
  const { spacing } = useAppTheme();

  return (
    <Card
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="summary"
    >
      <StatusBadge label="Offline" tone="info" />
      <View accessibilityLiveRegion="polite" style={{ gap: spacing.xs }}>
        <AppText variant="heading">{title}</AppText>
        <AppText tone="secondary">{description}</AppText>
      </View>
    </Card>
  );
}
