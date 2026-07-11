import { View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

import { AppText } from './AppText';

type SectionHeaderProps = { description?: string; title: string };

export function SectionHeader({ description, title }: SectionHeaderProps) {
  const { spacing } = useAppTheme();

  return (
    <View style={{ gap: spacing.xxs }}>
      <AppText accessibilityRole="header" variant="heading">
        {title}
      </AppText>
      {description ? <AppText tone="secondary">{description}</AppText> : null}
    </View>
  );
}
