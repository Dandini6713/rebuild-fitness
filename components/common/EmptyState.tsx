import { View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';
import { SecondaryButton } from './Button';
import { Card } from './Card';

type EmptyStateProps = {
  actionLabel?: string;
  description: string;
  onAction?: () => void;
  title: string;
};

export function EmptyState({
  actionLabel,
  description,
  onAction,
  title,
}: EmptyStateProps) {
  const { spacing } = useAppTheme();

  return (
    <Card
      accessibilityLabel={`${title}. ${description}`}
      accessibilityRole="summary"
    >
      <View style={{ gap: spacing.xs }}>
        <AppText variant="heading">{title}</AppText>
        <AppText tone="secondary">{description}</AppText>
      </View>
      {actionLabel && onAction ? (
        <SecondaryButton label={actionLabel} onPress={onAction} />
      ) : null}
    </Card>
  );
}
