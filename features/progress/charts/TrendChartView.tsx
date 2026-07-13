// A pure, dependency-free trend chart for the dashboard's measurement series (weight,
// waist — roadmap 21). No SVG and no charting library: each raw reading is a dot
// positioned by percentage from the pure scale, so a fixed-height View is all that is
// needed and the axis logic is tested in chartScale.ts.
//
// Two docs/09 §9.6 rules are load-bearing here:
//   - RAW lightly, TREND prominently: the raw readings are quiet dots; the smoothed
//     trend level (when there is one) is the accent line. They are visibly different, so
//     a smoothed figure is never mistaken for a reading.
//   - NO MISLEADING TRUNCATED AXIS: body weight uses a magnified, NON-ZERO baseline
//     (zero would flatten a real move), and that baseline is drawn and LABELLED at the
//     foot of the axis, so the magnification is never silent.
//
// Sparse data is honest: a scatter of dots implies no interpolation between them, so a
// couple of readings look like a couple of readings — never a confident line. The whole
// chart carries one accessible summary (docs/09 §9.8).

import { View } from 'react-native';

import { AppText } from '@/components/common';
import type { PointScale } from '@/domain/progress/chartScale';
import type { TrendPoint } from '@/domain/progress/progressSeries';
import { useAppTheme } from '@/theme/useAppTheme';

const PLOT_HEIGHT = 140;

type TrendChartViewProps = {
  points: readonly TrendPoint[];
  scale: PointScale;
  // Formats an axis value (e.g. "74 kg", "82 cm").
  formatValue: (value: number) => string;
  accessibilitySummary: string;
  // The smoothed trend level as a fraction (0 = baseline, 1 = top), drawn as the accent
  // line. Null when there is no trend (then only the raw dots show).
  trendLevelFraction?: number | null;
  trendLabel?: string | undefined;
};

export function TrendChartView({
  accessibilitySummary,
  formatValue,
  points,
  scale,
  trendLabel,
  trendLevelFraction = null,
}: TrendChartViewProps) {
  const { colours, radii, spacing } = useAppTheme();

  return (
    <View
      accessible
      accessibilityLabel={accessibilitySummary}
      accessibilityRole="image"
      style={{ gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {/* Y axis: top and baseline values, so a non-zero (magnified) baseline is always
            labelled. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ height: PLOT_HEIGHT, justifyContent: 'space-between' }}
        >
          <AppText tone="tertiary" variant="caption">
            {formatValue(scale.top)}
          </AppText>
          <AppText tone="tertiary" variant="caption">
            {formatValue(scale.baseline)}
          </AppText>
        </View>

        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            backgroundColor: colours.surfaceMuted,
            borderRadius: radii.medium,
            flex: 1,
            height: PLOT_HEIGHT,
            position: 'relative',
          }}
        >
          {/* The smoothed trend level (weight): the accent line, drawn prominently. */}
          {trendLevelFraction !== null ? (
            <View
              style={{
                backgroundColor: colours.accent,
                bottom: trendLevelFraction * PLOT_HEIGHT,
                height: 2,
                left: 0,
                position: 'absolute',
                right: 0,
              }}
            />
          ) : null}

          {points.map((point, index) => {
            const yFraction = scale.fractions[index] ?? 0;
            const isLatest = index === points.length - 1;
            const size = isLatest ? 12 : 8;
            return (
              <View
                key={`${point.atIso}-${index}`}
                style={{
                  backgroundColor: isLatest
                    ? colours.accent
                    : colours.textTertiary,
                  borderColor: colours.surface,
                  borderRadius: size / 2,
                  borderWidth: isLatest ? 2 : 0,
                  bottom: yFraction * PLOT_HEIGHT,
                  height: size,
                  left: `${point.xFraction * 100}%`,
                  marginBottom: -size / 2,
                  marginLeft: -size / 2,
                  position: 'absolute',
                  width: size,
                }}
              />
            );
          })}
        </View>
      </View>

      {!scale.baselineIsZero ? (
        <AppText tone="tertiary" variant="caption">
          {`Axis starts at ${formatValue(scale.baseline)}, not zero, so the change is easier to see.`}
        </AppText>
      ) : null}
      {trendLevelFraction !== null && trendLabel ? (
        <AppText tone="tertiary" variant="caption">
          {trendLabel}
        </AppText>
      ) : null}
    </View>
  );
}
