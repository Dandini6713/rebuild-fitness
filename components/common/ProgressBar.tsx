import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/theme/useAppTheme';

type ProgressBarProps = { accessibilityLabel: string; value: number };

export function ProgressBar({ accessibilityLabel, value }: ProgressBarProps) {
  const { colours, radii } = useAppTheme();
  const percentage = Math.min(100, Math.max(0, value));

  return (
    <View
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="progressbar"
      accessibilityValue={{
        max: 100,
        min: 0,
        now: percentage,
        text: `${Math.round(percentage)} per cent`,
      }}
      style={[
        styles.track,
        { backgroundColor: colours.track, borderRadius: radii.pill },
      ]}
    >
      <View
        testID="progress-bar-fill"
        style={[
          styles.fill,
          {
            backgroundColor: colours.accent,
            borderRadius: radii.pill,
            width: `${percentage}%`,
          },
        ]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 10, overflow: 'hidden', width: '100%' },
  fill: { height: '100%' },
});
