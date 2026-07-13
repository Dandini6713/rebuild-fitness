// A pure, dependency-free bar chart for the dashboard's weekly series (roadmap 21). No
// SVG and no charting library: bars are Views whose height is a fraction the pure
// chartScale returns, so the drawing is trivial and the axis logic is tested elsewhere.
// The whole chart exposes ONE accessible text summary (docs/09 §9.8) — the bars
// themselves are decorative and hidden from the screen reader, so a VoiceOver user hears
// the summary, not a stream of unlabelled rectangles.
//
// The axis is always ZERO-BASELINED (computeBarScale guarantees it), so bar heights are
// never exaggerated by a truncated axis (docs/09 §9.6). One accent (evergreen) marks the
// highlighted week; every other bar is quiet.

import { View } from 'react-native';

import { AppText } from '@/components/common';
import type { BarScale } from '@/domain/progress/chartScale';
import type { WeeklyBar } from '@/domain/progress/progressSeries';
import { useAppTheme } from '@/theme/useAppTheme';

const PLOT_HEIGHT = 120;

type BarChartViewProps = {
  bars: readonly WeeklyBar[];
  scale: BarScale;
  // Formats a bar value for the callout (e.g. "78%", "42 min"). Nulls are never passed.
  formatValue: (value: number) => string;
  // The bar to feature with the accent and a floating callout pill (usually the latest).
  highlightIndex: number | null;
  // A single sentence describing the whole series for the screen reader.
  accessibilitySummary: string;
  // Optional label for a reference line (e.g. "Target 140 g"); drawn at referenceFraction.
  referenceLabel?: string | undefined;
};

export function BarChartView({
  accessibilitySummary,
  bars,
  formatValue,
  highlightIndex,
  referenceLabel,
  scale,
}: BarChartViewProps) {
  const { colours, radii, spacing } = useAppTheme();

  // With few weeks, label every bar; with twelve, only the ends, to avoid a cramped axis
  // (docs/09 §9.4 "avoid tiny chart controls").
  const labelEvery = bars.length > 6 ? bars.length - 1 : 1;

  return (
    <View
      accessible
      accessibilityLabel={accessibilitySummary}
      accessibilityRole="image"
      style={{ gap: spacing.xs }}
    >
      <View style={{ flexDirection: 'row', gap: spacing.md }}>
        {/* Y axis: the top and the zero baseline, so the scale is explicit. */}
        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{ height: PLOT_HEIGHT, justifyContent: 'space-between' }}
        >
          <AppText tone="tertiary" variant="caption">
            {formatValue(scale.max)}
          </AppText>
          <AppText tone="tertiary" variant="caption">
            0
          </AppText>
        </View>

        <View
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
          style={{
            alignItems: 'flex-end',
            flex: 1,
            flexDirection: 'row',
            gap: bars.length > 6 ? 3 : spacing.xs,
            height: PLOT_HEIGHT,
            position: 'relative',
          }}
        >
          {/* Optional reference (target) line across the plot. */}
          {scale.referenceFraction !== null ? (
            <View
              style={{
                backgroundColor: colours.textTertiary,
                bottom: scale.referenceFraction * PLOT_HEIGHT,
                height: 1,
                left: 0,
                opacity: 0.6,
                position: 'absolute',
                right: 0,
              }}
            />
          ) : null}

          {bars.map((bar, index) => {
            const fraction = scale.fractions[index] ?? null;
            const isHighlight = index === highlightIndex && bar.value !== null;
            // A null bar (no basis that week) is drawn as a faint stub on the baseline,
            // clearly not a zero-height achievement.
            const height =
              fraction === null ? 2 : Math.max(2, fraction * PLOT_HEIGHT);
            return (
              <View
                key={bar.startDay}
                style={{
                  alignItems: 'center',
                  flex: 1,
                  height: '100%',
                  justifyContent: 'flex-end',
                }}
              >
                {isHighlight && bar.value !== null ? (
                  <View
                    style={{
                      backgroundColor: colours.accentSoft,
                      borderRadius: radii.pill,
                      marginBottom: spacing.xxs,
                      paddingHorizontal: spacing.xs,
                      paddingVertical: 2,
                    }}
                  >
                    <AppText
                      style={{ color: colours.accent }}
                      variant="caption"
                    >
                      {formatValue(bar.value)}
                    </AppText>
                  </View>
                ) : null}
                <View
                  style={{
                    backgroundColor:
                      fraction === null
                        ? colours.border
                        : isHighlight
                          ? colours.accent
                          : colours.track,
                    borderRadius: radii.small,
                    height,
                    width: '100%',
                  }}
                />
              </View>
            );
          })}
        </View>
      </View>

      {/* X axis labels, sparse when there are many weeks. */}
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        style={{
          flexDirection: 'row',
          gap: bars.length > 6 ? 3 : spacing.xs,
          paddingLeft: spacing.md + 24,
        }}
      >
        {bars.map((bar, index) => (
          <View key={bar.startDay} style={{ flex: 1 }}>
            {index % labelEvery === 0 || index === bars.length - 1 ? (
              <AppText tone="tertiary" variant="caption">
                {bar.label}
              </AppText>
            ) : null}
          </View>
        ))}
      </View>

      {referenceLabel ? (
        <AppText tone="tertiary" variant="caption">
          {referenceLabel}
        </AppText>
      ) : null}
    </View>
  );
}
