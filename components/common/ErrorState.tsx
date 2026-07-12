// Shared error state. Composition of EmptyState was considered, but rejected:
// EmptyState carries no status semantics, whereas docs/09 §9.2 and §9.8 require
// an error to convey its status by icon and text (never colour alone) and to be
// announced. This panel uses a StatusBadge for the icon+text status, an
// assertive live region for the message, and an optional retry action. The
// caution tone (amber) is deliberate: a failed load is not a safety stop, and
// docs/09 reserves red for genuine safety or destructive actions.

import { View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';
import { SecondaryButton } from './Button';
import { Card } from './Card';
import { StatusBadge } from './StatusBadge';

type ErrorStateProps = {
  description: string;
  onRetry?: () => void;
  retryLabel?: string;
  title?: string;
};

export function ErrorState({
  description,
  onRetry,
  retryLabel = 'Try again',
  title = 'Something went wrong',
}: ErrorStateProps) {
  const { spacing } = useAppTheme();

  return (
    <Card
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="alert"
    >
      <StatusBadge label="Error" tone="caution" />
      <View accessibilityLiveRegion="assertive" style={{ gap: spacing.xs }}>
        <AppText variant="heading">{title}</AppText>
        <AppText tone="secondary">{description}</AppText>
      </View>
      {onRetry ? (
        <SecondaryButton label={retryLabel} onPress={onRetry} />
      ) : null}
    </Card>
  );
}
