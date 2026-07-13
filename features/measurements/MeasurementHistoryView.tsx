// Presentational rendering of the measurement history and weight trend (roadmap 18,
// docs/03 S-034, docs/06 §6.6). Pure in its props — it takes the resolved state, not the
// hook — so every state is testable without Supabase or auth (mirrors TodayView and
// RunningProgressionView). British English throughout; nothing appearance-insulting
// (docs/07).
//
// The load-bearing rule of docs/06 §6.6 in the UI: the RAW logged values and the
// computed TREND are presented SEPARATELY. They live in different cards with different
// headings, so a smoothed trend is never mistaken for a measurement. When there is not
// enough data for a trend, the raw values are still shown and the trend card explains
// plainly which threshold is unmet — it never hides the section or shows a misleading
// number.

import { View } from 'react-native';

import {
  AppText,
  Card,
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
  StatusBadge,
} from '@/components/common';
import type {
  UnmetThreshold,
  WeightTrendResult,
} from '@/domain/measurements/weightTrend';

import type { MeasurementRecord } from './measurementRepository';
import { MEASUREMENT_CONFIG } from './measurementSchema';
import type { MeasurementsViewState } from './useMeasurements';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// A plain British date like "13 Jul 2026". Deterministic (no locale dependence).
function formatDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatValue(record: MeasurementRecord): string {
  return `${record.value} ${record.unit}`;
}

const DIRECTION_HEADINGS = {
  falling: 'Trending down',
  rising: 'Trending up',
  steady: 'Holding steady',
} as const;

// The plain explanation for an unmet sufficiency threshold. Both may be unmet; the
// short-window advice is the more immediate ask, so it leads.
function insufficientExplanation(unmet: UnmetThreshold[]): string {
  if (unmet.includes('three-in-seven')) {
    return 'Log at least three weights within a week to see a trend. A single reading swings too much day to day to draw a line through.';
  }
  return 'Log at least six weights across two weeks to see a trend. There is not quite enough yet to smooth out the daily ups and downs.';
}

// The weight-trend card. Always shown when there are weights; kept apart from the raw
// list. Either the smoothed trend, or an honest explanation of why there is not one yet.
function TrendCard({ trend }: { trend: WeightTrendResult }) {
  if (trend.status === 'insufficient-data') {
    return (
      <Card>
        <StatusBadge label="Weight trend" tone="info" />
        <AppText variant="body">
          {insufficientExplanation(trend.unmetThresholds)}
        </AppText>
        <AppText tone="secondary" variant="caption">
          {`So far: ${trend.inputs.countWithinShortWindow} in the last week, ${trend.inputs.countWithinLongWindow} in the last two weeks.`}
        </AppText>
      </Card>
    );
  }

  const roundedTrend = Math.round(trend.trendKg * 10) / 10;
  const weeklyMagnitude = Math.abs(Math.round(trend.changePerWeekKg * 10) / 10);
  const rateSentence =
    trend.direction === 'steady'
      ? 'Your weight is holding steady.'
      : `About ${weeklyMagnitude} kg per week ${
          trend.direction === 'falling' ? 'down' : 'up'
        }.`;

  return (
    <Card>
      <StatusBadge label="Weight trend" tone="info" />
      <AppText variant="heading">{DIRECTION_HEADINGS[trend.direction]}</AppText>
      <AppText variant="body">{`Smoothed trend: about ${roundedTrend} kg.`}</AppText>
      <AppText variant="body">{rateSentence}</AppText>
      <AppText tone="secondary" variant="caption">
        This is a rolling seven-day average, not your latest reading — it is
        steadier than any single weigh-in.
      </AppText>
    </Card>
  );
}

// A raw history list for one measurement type, most recent first. Shows only the
// logged values — never the trend.
function RawList({ records }: { records: MeasurementRecord[] }) {
  if (records.length === 0) {
    return null;
  }
  const config = MEASUREMENT_CONFIG[records[0]!.type];
  return (
    <View style={{ gap: 8 }}>
      <SectionHeader title={`${config.label} history`} />
      {records.map((record) => (
        <Card key={record.id}>
          <AppText variant="heading">{formatValue(record)}</AppText>
          <AppText tone="secondary" variant="caption">
            {formatDate(record.measuredAtIso)}
          </AppText>
          {record.conditionsNote ? (
            <AppText tone="secondary" variant="body">
              {record.conditionsNote}
            </AppText>
          ) : null}
        </Card>
      ))}
    </View>
  );
}

export function MeasurementHistoryView({
  state,
}: {
  state: MeasurementsViewState;
}) {
  if (state.status === 'loading') {
    return (
      <LoadingState
        description="Loading your measurements."
        label="Loading your measurements"
      />
    );
  }
  if (state.status === 'unavailable') {
    return (
      <ErrorState description="Your measurements are unavailable right now. Please try again later." />
    );
  }
  if (state.status === 'error') {
    return <ErrorState description={state.message} />;
  }

  const { trend, waist, weight } = state.data;

  if (weight.length === 0 && waist.length === 0) {
    return (
      <EmptyState
        description="Once you log your weight or waist, your readings and your weight trend will appear here."
        title="No measurements yet"
      />
    );
  }

  return (
    <View style={{ gap: 24 }}>
      {/* The trend is only ever computed from weights, so it is shown when there are
          weights. It sits in its own card, apart from the raw readings below. */}
      {weight.length > 0 ? <TrendCard trend={trend} /> : null}
      <RawList records={weight} />
      <RawList records={waist} />
    </View>
  );
}
