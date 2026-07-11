import { View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';

export type StatusTone = 'neutral' | 'success' | 'caution' | 'danger' | 'info';
type StatusBadgeProps = { label: string; tone?: StatusTone };

const symbols: Record<StatusTone, string> = {
  caution: '!',
  danger: '×',
  info: 'i',
  neutral: '•',
  success: '✓',
};

export function StatusBadge({ label, tone = 'neutral' }: StatusBadgeProps) {
  const { colours, radii, spacing } = useAppTheme();
  const treatments = {
    caution: [colours.cautionBackground, colours.cautionText],
    danger: [colours.dangerBackground, colours.dangerText],
    info: [colours.infoBackground, colours.infoText],
    neutral: [colours.surfaceMuted, colours.textSecondary],
    success: [colours.successBackground, colours.successText],
  } as const;
  const [backgroundColor, color] = treatments[tone];

  return (
    <View
      accessibilityLabel={`${label}, ${tone} status`}
      accessibilityRole="text"
      style={{
        alignItems: 'center',
        alignSelf: 'flex-start',
        backgroundColor,
        borderRadius: radii.pill,
        flexDirection: 'row',
        gap: spacing.xxs,
        minHeight: 28,
        paddingHorizontal: spacing.sm,
      }}
    >
      <AppText style={{ color }} variant="caption">
        {symbols[tone]} {label}
      </AppText>
    </View>
  );
}
