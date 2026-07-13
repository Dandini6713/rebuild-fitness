import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { MeasurementHistoryView } from '@/features/measurements/MeasurementHistoryView';
import type {
  MeasurementHistory,
  MeasurementRecord,
} from '@/features/measurements/measurementRepository';
import type { WeightTrendResult } from '@/domain/measurements/weightTrend';

const inputs = {
  countWithinLongWindow: 6,
  countWithinShortWindow: 3,
  longWindowDays: 14,
  longWindowMinCount: 6,
  referenceDateIso: '2026-07-13T08:00:00.000Z',
  shortWindowDays: 7,
  shortWindowMinCount: 3,
  tauDays: 7,
  weightCountConsidered: 6,
};

function weightRecord(
  overrides: Partial<MeasurementRecord> = {},
): MeasurementRecord {
  return {
    conditionsNote: null,
    id: 'w1',
    measuredAtIso: '2026-07-13T07:00:00.000Z',
    type: 'weight',
    unit: 'kg',
    value: 82.4,
    ...overrides,
  };
}

function history(
  overrides: Partial<MeasurementHistory> = {},
): MeasurementHistory {
  return {
    trend: {
      changePerWeekKg: -0.5,
      direction: 'falling',
      inputs,
      ruleVersion: 'weight-trend/v1',
      status: 'trend',
      trendKg: 82.1,
    },
    waist: [],
    weight: [weightRecord()],
    ...overrides,
  };
}

const insufficient: WeightTrendResult = {
  inputs: {
    ...inputs,
    countWithinShortWindow: 1,
    countWithinLongWindow: 1,
    weightCountConsidered: 1,
  },
  ruleVersion: 'weight-trend/v1',
  status: 'insufficient-data',
  unmetThresholds: ['three-in-seven', 'six-in-fourteen'],
};

describe('MeasurementHistoryView', () => {
  it('shows the loading state', async () => {
    const { getByText } = await render(
      <MeasurementHistoryView state={{ status: 'loading' }} />,
    );
    expect(getByText('Loading your measurements.')).toBeTruthy();
  });

  it('shows the error state', async () => {
    const { getByText } = await render(
      <MeasurementHistoryView state={{ message: 'boom', status: 'error' }} />,
    );
    expect(getByText('boom')).toBeTruthy();
  });

  it('shows an empty state when nothing is logged', async () => {
    const { getByText } = await render(
      <MeasurementHistoryView
        state={{
          data: history({ trend: insufficient, weight: [] }),
          status: 'ready',
        }}
      />,
    );
    expect(getByText('No measurements yet')).toBeTruthy();
  });

  it('presents the raw value and the smoothed trend as SEPARATE things', async () => {
    const { getByText } = await render(
      <MeasurementHistoryView state={{ data: history(), status: 'ready' }} />,
    );
    // The raw reading, shown as logged.
    expect(getByText('82.4 kg')).toBeTruthy();
    expect(getByText('13 Jul 2026')).toBeTruthy();
    // The trend, in its own card, clearly labelled as a smoothed average — a different
    // number from the raw reading, and explicitly not the latest weigh-in.
    expect(getByText('Trending down')).toBeTruthy();
    expect(getByText('Smoothed trend: about 82.1 kg.')).toBeTruthy();
    expect(
      getByText(/rolling seven-day average, not your latest reading/i),
    ).toBeTruthy();
  });

  it('shows the raw weights AND explains the unmet threshold when there is no trend yet', async () => {
    const { getByText, queryByText } = await render(
      <MeasurementHistoryView
        state={{ data: history({ trend: insufficient }), status: 'ready' }}
      />,
    );
    // The raw reading still shows.
    expect(getByText('82.4 kg')).toBeTruthy();
    // A plain explanation, naming what to log — never a fabricated trend number.
    expect(
      getByText(/Log at least three weights within a week to see a trend/i),
    ).toBeTruthy();
    expect(queryByText(/Smoothed trend/i)).toBeNull();
  });

  it('sections weight and waist history separately', async () => {
    const { getByText } = await render(
      <MeasurementHistoryView
        state={{
          data: history({
            waist: [
              weightRecord({ id: 'c1', type: 'waist', unit: 'cm', value: 92 }),
            ],
          }),
          status: 'ready',
        }}
      />,
    );
    expect(getByText('Weight history')).toBeTruthy();
    expect(getByText('Waist history')).toBeTruthy();
    expect(getByText('92 cm')).toBeTruthy();
  });
});
