// Presentational rendering of the progress dashboard (roadmap 21, docs/03 S-040). Pure
// in its props — it takes the resolved state, not the hook — so every state is testable
// without Supabase or auth (mirrors TodayView and MeasurementHistoryView). British
// English throughout; nothing appearance-insulting and no judgement, least of all on the
// alcohol tile (docs/07 §7.4, docs/06 §6.9).
//
// Layout is a BENTO grid of deliberately unequal tiles translated into our tokens: the
// weight trend gets the large featured tile with its chart; adherence a full-width
// featured bar chart; cardio, protein, strength and lager smaller half tiles; waist a
// full-width scatter. ONE accent (evergreen) carries the emphasis — the featured chart's
// highlighted point/bar and the callout pill — and everything else stays quiet, matching
// docs/09. Light and dark come free from the semantic tokens read via useAppTheme.
//
// Every tile is ROBUST to sparse data the mockup hides: an empty series shows an honest,
// inviting message (never a blank); a single reading is centred, not implied as a trend;
// and each chart carries an accessible text summary, so a series is never conveyed by
// colour or shape alone.

import { ReactNode } from 'react';
import { Pressable, View } from 'react-native';

import { AppText, Card, ErrorState, LoadingState } from '@/components/common';
import {
  computeBarScale,
  computePointScale,
  pointFraction,
} from '@/domain/progress/chartScale';
import type { DashboardWindowWeeks } from '@/domain/progress/progressWindows';
import type {
  AdherenceSeries,
  CardioSeries,
  LagerSeries,
  ProteinSeries,
  StrengthSeries,
  WaistSeries,
  WeeklyBar,
  WeightSeries,
} from '@/domain/progress/progressSeries';
import { useAppTheme } from '@/theme/useAppTheme';

import { BarChartView } from './charts/BarChartView';
import { TrendChartView } from './charts/TrendChartView';
import type { ProgressDashboardState } from './useProgressDashboard';

// The index of the most recent week that has a real value, for the accent highlight and
// the floating callout. Null when no week has data.
function lastWithValue(bars: readonly WeeklyBar[]): number | null {
  for (let i = bars.length - 1; i >= 0; i -= 1) {
    if (bars[i]!.value !== null) {
      return i;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Period strip (4 vs 12 weeks) — the Today day-nav pill pattern, not a new idiom.
// ---------------------------------------------------------------------------

function PeriodStrip({
  weeks,
  onSelectWeeks,
}: {
  weeks: DashboardWindowWeeks;
  onSelectWeeks: (weeks: DashboardWindowWeeks) => void;
}) {
  const { colours, radii, spacing, touchTargets } = useAppTheme();
  const options: { label: string; value: DashboardWindowWeeks }[] = [
    { label: '4 weeks', value: 4 },
    { label: '12 weeks', value: 12 },
  ];
  return (
    <View
      accessibilityRole="tablist"
      style={{
        backgroundColor: colours.surfaceMuted,
        borderRadius: radii.pill,
        flexDirection: 'row',
        gap: spacing.xxs,
        padding: spacing.xxs,
      }}
    >
      {options.map((option) => {
        const selected = option.value === weeks;
        return (
          <Pressable
            accessibilityLabel={`Show the last ${option.label}`}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onSelectWeeks(option.value)}
            style={{
              alignItems: 'center',
              backgroundColor: selected ? colours.accent : 'transparent',
              borderRadius: radii.pill,
              flex: 1,
              minHeight: touchTargets.minimum,
              justifyContent: 'center',
            }}
          >
            <AppText
              style={{
                color: selected ? colours.onAccent : colours.textSecondary,
              }}
              variant="label"
            >
              {option.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

// ---------------------------------------------------------------------------
// Tile scaffold: heading, heavy value, caption, then the chart or an honest empty state.
// ---------------------------------------------------------------------------

function Tile({
  title,
  value,
  caption,
  children,
  half = false,
}: {
  title: string;
  value: string;
  caption: string;
  children: ReactNode;
  half?: boolean;
}) {
  const { spacing } = useAppTheme();
  return (
    <Card
      style={
        half ? { flexBasis: '47%', flexGrow: 1, minWidth: 150 } : undefined
      }
    >
      <View style={{ gap: spacing.xxs }}>
        <AppText accessibilityRole="header" tone="secondary" variant="label">
          {title}
        </AppText>
        <AppText variant="title">{value}</AppText>
        <AppText tone="tertiary" variant="caption">
          {caption}
        </AppText>
      </View>
      {children}
    </Card>
  );
}

// An inviting, non-judgemental empty message inside a tile (never a blank).
function TileEmpty({ message }: { message: string }) {
  return (
    <AppText tone="secondary" variant="body">
      {message}
    </AppText>
  );
}

// ---------------------------------------------------------------------------
// Tiles
// ---------------------------------------------------------------------------

const DIRECTION_WORD = {
  falling: 'down',
  rising: 'up',
  steady: 'holding steady',
} as const;

function WeightTile({
  series,
  weeks,
}: {
  series: WeightSeries;
  weeks: number;
}) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} title="Weight trend" value="—">
        <TileEmpty message="Log your weight a few times and your smoothed trend will appear here — steadier than any single weigh-in." />
      </Tile>
    );
  }

  const values = series.points.map((point) => point.value);
  const scale = computePointScale(values, { flatBand: 1, minPadding: 0.5 });

  const trend = series.trend;
  const hasTrend = trend.status === 'trend';
  const trendKg = hasTrend ? Math.round(trend.trendKg * 10) / 10 : null;
  const perWeek =
    hasTrend && trend.direction !== 'steady'
      ? Math.abs(Math.round(trend.changePerWeekKg * 10) / 10)
      : null;

  const summary = hasTrend
    ? `Weight trend over the last ${weeks} weeks: smoothed to about ${trendKg} kilograms, ${
        trend.direction === 'steady'
          ? 'holding steady'
          : `trending ${DIRECTION_WORD[trend.direction]} about ${perWeek} kilograms per week`
      }. Based on ${series.points.length} readings shown.`
    : `Weight over the last ${weeks} weeks: ${series.points.length} readings logged. Not enough yet for a trend — log at least three weights within a week.`;

  return (
    <Tile
      caption={
        hasTrend
          ? `Smoothed seven-day trend, ${DIRECTION_WORD[trend.direction]} ${perWeek ? `${perWeek} kg/week` : ''}`.trim()
          : 'Raw readings — not enough yet for a trend'
      }
      title="Weight trend"
      value={
        trendKg !== null ? `${trendKg} kg` : `${series.points.length} logged`
      }
    >
      <TrendChartView
        accessibilitySummary={summary}
        formatValue={(value) => `${Math.round(value * 10) / 10} kg`}
        points={series.points}
        scale={scale}
        trendLabel={
          hasTrend
            ? 'The line is your smoothed trend; the dots are your raw weigh-ins.'
            : undefined
        }
        trendLevelFraction={
          hasTrend ? pointFraction(scale, trend.trendKg) : null
        }
      />
    </Tile>
  );
}

function WaistTile({ series, weeks }: { series: WaistSeries; weeks: number }) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} title="Waist" value="—">
        <TileEmpty message="Log your waist and your readings will appear here." />
      </Tile>
    );
  }
  const values = series.points.map((point) => point.value);
  const scale = computePointScale(values, { flatBand: 2, minPadding: 1 });
  const latest = series.points[series.points.length - 1]!.value;
  const change = series.change;
  const changeText =
    change.status === 'available'
      ? `${change.changeCm > 0 ? 'up' : change.changeCm < 0 ? 'down' : 'level'} ${Math.abs(change.changeCm)} cm over ${change.spanDays} days`
      : 'Log at least two readings to see a change';

  const summary =
    change.status === 'available'
      ? `Waist over the last ${weeks} weeks: ${change.count} readings, latest ${latest} centimetres, ${changeText}.`
      : `Waist over the last ${weeks} weeks: ${change.count} reading. Not enough yet to show a change.`;

  return (
    <Tile caption={changeText} title="Waist" value={`${latest} cm`}>
      <TrendChartView
        accessibilitySummary={summary}
        formatValue={(value) => `${Math.round(value * 10) / 10} cm`}
        points={series.points}
        scale={scale}
      />
    </Tile>
  );
}

function AdherenceTile({
  series,
  weeks,
}: {
  series: AdherenceSeries;
  weeks: number;
}) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} title="Session adherence" value="—">
        <TileEmpty message="Once sessions are planned and completed, your weekly adherence will show here." />
      </Tile>
    );
  }
  const scale = computeBarScale(
    series.bars.map((bar) => bar.value),
    { minMax: 100, referenceValue: 100 },
  );
  const highlight = lastWithValue(series.bars);
  const summary = `Session adherence over the last ${weeks} weeks: you completed ${series.totalCompleted} of ${series.totalPlanned} planned sessions. Each bar is one week's completion percentage.`;

  return (
    <Tile
      caption="Completed of planned, each week"
      title="Session adherence"
      value={`${series.totalCompleted} of ${series.totalPlanned}`}
    >
      <BarChartView
        accessibilitySummary={summary}
        bars={series.bars}
        formatValue={(value) => `${value}%`}
        highlightIndex={highlight}
        scale={scale}
      />
    </Tile>
  );
}

function StrengthTile({
  series,
  weeks,
}: {
  series: StrengthSeries;
  weeks: number;
}) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} half title="Strength" value="—">
        <TileEmpty message="Complete a strength session to start building this." />
      </Tile>
    );
  }
  const scale = computeBarScale(series.bars.map((bar) => bar.value));
  const summary = `Strength sessions completed over the last ${weeks} weeks: ${series.total} in total. Each bar is one week's completed sessions.`;
  return (
    <Tile
      caption="Sessions completed each week"
      half
      title="Strength"
      value={`${series.total}`}
    >
      <BarChartView
        accessibilitySummary={summary}
        bars={series.bars}
        formatValue={(value) => `${value}`}
        highlightIndex={lastWithValue(series.bars)}
        scale={scale}
      />
    </Tile>
  );
}

function CardioTile({
  series,
  weeks,
}: {
  series: CardioSeries;
  weeks: number;
}) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} half title="Cardio" value="—">
        <TileEmpty message="Finish a cardio session to see your minutes here." />
      </Tile>
    );
  }
  const scale = computeBarScale(series.bars.map((bar) => bar.value));
  const summary = `Cardio over the last ${weeks} weeks: ${series.totalMinutes} minutes in total. Each bar is one week's minutes.`;
  return (
    <Tile
      caption="Minutes each week"
      half
      title="Cardio"
      value={`${series.totalMinutes} min`}
    >
      <BarChartView
        accessibilitySummary={summary}
        bars={series.bars}
        formatValue={(value) => `${value} min`}
        highlightIndex={lastWithValue(series.bars)}
        scale={scale}
      />
    </Tile>
  );
}

function ProteinTile({
  series,
  weeks,
}: {
  series: ProteinSeries;
  weeks: number;
}) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} half title="Protein" value="—">
        <TileEmpty message="Log your food to see your average daily protein here." />
      </Tile>
    );
  }
  const scale = computeBarScale(
    series.bars.map((bar) => bar.value),
    {
      ...(series.targetG !== null ? { referenceValue: series.targetG } : {}),
    },
  );
  const targetText =
    series.targetG !== null
      ? ` Your target is ${series.targetG} grams a day.`
      : '';
  const summary = `Protein over the last ${weeks} weeks: about ${series.averagePerDay} grams a day on average. Each bar is one week's daily average.${targetText}`;
  return (
    <Tile
      caption="Average grams per day"
      half
      title="Protein"
      value={`${series.averagePerDay} g`}
    >
      <BarChartView
        accessibilitySummary={summary}
        bars={series.bars}
        formatValue={(value) => `${value} g`}
        highlightIndex={lastWithValue(series.bars)}
        referenceLabel={
          series.targetG !== null ? `Target ${series.targetG} g/day` : undefined
        }
        scale={scale}
      />
    </Tile>
  );
}

function LagerTile({ series, weeks }: { series: LagerSeries; weeks: number }) {
  if (!series.hasData) {
    return (
      <Tile caption={`Last ${weeks} weeks`} half title="Alcohol" value="—">
        <TileEmpty message="Log a drink to see your weekly units here." />
      </Tile>
    );
  }
  const scale = computeBarScale(series.bars.map((bar) => bar.value));
  // Neutral by design: totals only, no judgement and no compensatory anything.
  const summary = `Alcohol over the last ${weeks} weeks: ${series.totalUnits} units in total. Each bar is one week's units.`;
  return (
    <Tile
      caption="UK units each week"
      half
      title="Alcohol"
      value={`${series.totalUnits} units`}
    >
      <BarChartView
        accessibilitySummary={summary}
        bars={series.bars}
        formatValue={(value) => `${value}`}
        highlightIndex={lastWithValue(series.bars)}
        scale={scale}
      />
    </Tile>
  );
}

// ---------------------------------------------------------------------------
// The dashboard
// ---------------------------------------------------------------------------

export function ProgressDashboardView({
  state,
  weeks,
  onSelectWeeks,
}: {
  state: ProgressDashboardState;
  weeks: DashboardWindowWeeks;
  onSelectWeeks: (weeks: DashboardWindowWeeks) => void;
}) {
  const { spacing } = useAppTheme();

  let content: ReactNode;
  if (state.status === 'loading') {
    content = (
      <LoadingState
        description="Loading your progress."
        label="Loading your progress"
      />
    );
  } else if (state.status === 'unavailable') {
    content = (
      <ErrorState description="Your progress is unavailable right now. Please try again later." />
    );
  } else if (state.status === 'error') {
    content = <ErrorState description={state.message} />;
  } else {
    // Each tile shows its own honest, inviting empty state, so an all-empty dashboard is a
    // grid of "here's what will appear" prompts rather than one generic banner — and the
    // partial case (some series logged, some not) is handled by the very same per-tile
    // states, with no special-casing.
    const { adherence, cardio, lager, protein, strength, waist, weight } =
      state.data;

    content = (
      <View style={{ gap: spacing.md }}>
        <WeightTile series={weight} weeks={weeks} />
        <AdherenceTile series={adherence} weeks={weeks} />
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: spacing.md,
          }}
        >
          <CardioTile series={cardio} weeks={weeks} />
          <ProteinTile series={protein} weeks={weeks} />
          <StrengthTile series={strength} weeks={weeks} />
          <LagerTile series={lager} weeks={weeks} />
        </View>
        <WaistTile series={waist} weeks={weeks} />
      </View>
    );
  }

  return (
    <View style={{ gap: spacing.lg }}>
      <PeriodStrip onSelectWeeks={onSelectWeeks} weeks={weeks} />
      {content}
    </View>
  );
}
