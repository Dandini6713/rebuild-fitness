import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  assembleAdherenceSeries,
  assembleCardioSeries,
  assembleLagerSeries,
  assembleProteinSeries,
  assembleStrengthSeries,
  assembleWaistSeries,
  assembleWeightSeries,
  type MeasurementRow,
} from '@/domain/progress/progressSeries';
import { weeklyBuckets, windowRange } from '@/domain/progress/progressWindows';
import { ProgressDashboardView } from '@/features/progress/ProgressDashboardView';
import type { DashboardData } from '@/features/progress/progressDashboardRepository';
import type { ProgressDashboardState } from '@/features/progress/useProgressDashboard';

const REF_DAY = '2026-07-13';
const REF_DATE = new Date('2026-07-13T12:00:00.000Z');
const buckets = weeklyBuckets(REF_DAY, 4, 0);
const range = windowRange(REF_DAY, 4, 0);

// A fully-populated dashboard, built from the real assemblers so the fixture matches what
// the app produces.
function fullData(): DashboardData {
  const weights: MeasurementRow[] = [
    { atIso: '2026-07-13T07:00:00.000Z', type: 'weight', value: 80 },
    { atIso: '2026-07-11T07:00:00.000Z', type: 'weight', value: 80.4 },
    { atIso: '2026-07-09T07:00:00.000Z', type: 'weight', value: 80.6 },
    { atIso: '2026-07-07T07:00:00.000Z', type: 'weight', value: 81 },
    { atIso: '2026-07-05T07:00:00.000Z', type: 'weight', value: 81.3 },
    { atIso: '2026-07-03T07:00:00.000Z', type: 'weight', value: 81.6 },
  ];
  const waists: MeasurementRow[] = [
    { atIso: '2026-07-01T07:00:00.000Z', type: 'waist', value: 92 },
    { atIso: '2026-07-11T07:00:00.000Z', type: 'waist', value: 90.5 },
  ];
  const sessions = [
    {
      id: 's1',
      scheduledDate: '2026-07-08',
      sessionType: 'strength',
      status: 'planned',
    },
    {
      id: 's2',
      scheduledDate: '2026-07-10',
      sessionType: 'cardio',
      status: 'planned',
    },
  ];
  const logs = [{ scheduledSessionId: 's1', status: 'completed' }];
  return {
    adherence: assembleAdherenceSeries(sessions, logs, buckets),
    buckets,
    cardio: assembleCardioSeries(
      [
        {
          durationSeconds: 1800,
          startedAtIso: '2026-07-10T09:00:00.000Z',
          status: 'completed',
        },
      ],
      buckets,
    ),
    lager: assembleLagerSeries(
      [{ loggedAtIso: '2026-07-11T20:00:00.000Z', units: 2.84 }],
      buckets,
    ),
    protein: assembleProteinSeries(
      [{ loggedAtIso: '2026-07-11T12:00:00.000Z', proteinG: 140 }],
      buckets,
      140,
    ),
    strength: assembleStrengthSeries(sessions, logs, buckets),
    waist: assembleWaistSeries(waists, range),
    weeks: 4,
    weight: assembleWeightSeries(weights, range, REF_DATE),
  };
}

function emptyData(): DashboardData {
  return {
    adherence: assembleAdherenceSeries([], [], buckets),
    buckets,
    cardio: assembleCardioSeries([], buckets),
    lager: assembleLagerSeries([], buckets),
    protein: assembleProteinSeries([], buckets, null),
    strength: assembleStrengthSeries([], [], buckets),
    waist: assembleWaistSeries([], range),
    weeks: 4,
    weight: assembleWeightSeries([], range, REF_DATE),
  };
}

function ready(data: DashboardData): ProgressDashboardState {
  return { data, status: 'ready' };
}

// Every visible text leaf plus accessibility labels, for the neutral-tone scan.
function renderedText(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(renderedText).join(' ');
  }
  if (node && typeof node === 'object') {
    const record = node as {
      children?: unknown;
      props?: { accessibilityLabel?: unknown };
    };
    const label =
      typeof record.props?.accessibilityLabel === 'string'
        ? record.props.accessibilityLabel
        : '';
    return `${label} ${renderedText(record.children)}`;
  }
  return '';
}

describe('ProgressDashboardView', () => {
  it('shows loading, error and unavailable states', async () => {
    const loading = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={{ status: 'loading' }}
        weeks={4}
      />,
    );
    expect(loading.getByText(/Loading your progress/)).toBeTruthy();

    const error = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={{ message: 'It broke', status: 'error' }}
        weeks={4}
      />,
    );
    expect(error.getByText('It broke')).toBeTruthy();

    const unavailable = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={{ status: 'unavailable' }}
        weeks={4}
      />,
    );
    expect(unavailable.getByText(/unavailable right now/)).toBeTruthy();
  });

  it('offers both windows and switches on press (the Today day-nav pill pattern)', async () => {
    const onSelectWeeks = jest.fn();
    const { getByLabelText } = await render(
      <ProgressDashboardView
        onSelectWeeks={onSelectWeeks}
        state={ready(fullData())}
        weeks={4}
      />,
    );
    fireEvent.press(getByLabelText('Show the last 12 weeks'));
    expect(onSelectWeeks).toHaveBeenCalledWith(12);
  });

  it('presents the weight trend and raw readings SEPARATELY (docs/09 §9.6)', async () => {
    const { getAllByText, getByText } = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={ready(fullData())}
        weeks={4}
      />,
    );
    // The trend is described apart from the raw dots, and the magnified axis is disclosed.
    expect(
      getByText(
        'The line is your smoothed trend; the dots are your raw weigh-ins.',
      ),
    ).toBeTruthy();
    // Both body-measurement tiles (weight and waist) disclose their non-zero baseline.
    expect(
      getAllByText(/Axis starts at .*, not zero/).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('gives each chart an accessible text summary, not colour or shape alone', async () => {
    const { getByLabelText } = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={ready(fullData())}
        weeks={4}
      />,
    );
    expect(getByLabelText(/Weight trend over the last 4 weeks/)).toBeTruthy();
    expect(
      getByLabelText(
        /Session adherence over the last 4 weeks: you completed 1 of 2/,
      ),
    ).toBeTruthy();
    expect(
      getByLabelText(/Cardio over the last 4 weeks: 30 minutes/),
    ).toBeTruthy();
    expect(
      getByLabelText(/Alcohol over the last 4 weeks: 2.84 units/),
    ).toBeTruthy();
  });

  it('keeps the alcohol tile strictly neutral — no judgement, no compensation', async () => {
    const { toJSON } = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={ready(fullData())}
        weeks={4}
      />,
    );
    const text = renderedText(toJSON()).toLowerCase();
    for (const forbidden of [
      'too much',
      'cut down',
      'cut back',
      'guilt',
      'burn it off',
      'make up for',
      'well done',
      'shame',
    ]) {
      expect(text).not.toContain(forbidden);
    }
  });

  it('shows honest, inviting empty tiles when nothing is logged (never a blank)', async () => {
    const { getByText } = await render(
      <ProgressDashboardView
        onSelectWeeks={() => {}}
        state={ready(emptyData())}
        weeks={4}
      />,
    );
    expect(getByText(/Log your weight/)).toBeTruthy();
    expect(getByText(/Complete a strength session/)).toBeTruthy();
    expect(getByText(/Log a drink to see your weekly units/)).toBeTruthy();
  });
});
