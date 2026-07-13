import { describe, expect, it } from '@jest/globals';

import {
  assembleAdherenceSeries,
  assembleCardioSeries,
  assembleLagerSeries,
  assembleProteinSeries,
  assembleStrengthSeries,
  assembleWaistSeries,
  assembleWeightSeries,
  type MeasurementRow,
  type SessionRow,
  type WorkoutLogRow,
} from '@/domain/progress/progressSeries';
import { weeklyBuckets, windowRange } from '@/domain/progress/progressWindows';

const REF_DAY = '2026-07-13';
const REF_DATE = new Date('2026-07-13T12:00:00.000Z');
const OFFSET = 0;

const buckets4 = weeklyBuckets(REF_DAY, 4, OFFSET);
const buckets12 = weeklyBuckets(REF_DAY, 12, OFFSET);
const range4 = windowRange(REF_DAY, 4, OFFSET);

function session(
  id: string,
  scheduledDate: string,
  sessionType: string,
  status = 'planned',
): SessionRow {
  return { id, scheduledDate, sessionType, status };
}
function completedLog(id: string): WorkoutLogRow {
  return { scheduledSessionId: id, status: 'completed' };
}

describe('assembleWeightSeries', () => {
  it('places raw readings in the window and delegates the trend to the engine', () => {
    const measurements: MeasurementRow[] = [
      { atIso: '2026-07-13T07:00:00.000Z', type: 'weight', value: 80 },
      { atIso: '2026-07-11T07:00:00.000Z', type: 'weight', value: 80.4 },
      { atIso: '2026-07-09T07:00:00.000Z', type: 'weight', value: 80.6 },
      { atIso: '2026-07-07T07:00:00.000Z', type: 'weight', value: 81 },
      { atIso: '2026-07-05T07:00:00.000Z', type: 'weight', value: 81.2 },
      { atIso: '2026-07-03T07:00:00.000Z', type: 'weight', value: 81.5 },
      // A waist row must never feed the weight series.
      { atIso: '2026-07-06T07:00:00.000Z', type: 'waist', value: 90 },
    ];
    const series = assembleWeightSeries(measurements, range4, REF_DATE);
    expect(series.hasData).toBe(true);
    expect(series.points).toHaveLength(6);
    // Points are sorted oldest → newest by their horizontal position.
    expect(series.points[0]!.value).toBe(81.5);
    expect(series.points[5]!.value).toBe(80);
    // Enough readings (6-in-14, 3-in-7) for the engine to give a trend.
    expect(series.trend.status).toBe('trend');
  });

  it('shows raw points but an honest insufficient-data trend when there are too few', () => {
    const measurements: MeasurementRow[] = [
      { atIso: '2026-07-12T07:00:00.000Z', type: 'weight', value: 80 },
      { atIso: '2026-07-10T07:00:00.000Z', type: 'weight', value: 80.5 },
    ];
    const series = assembleWeightSeries(measurements, range4, REF_DATE);
    expect(series.hasData).toBe(true);
    expect(series.points).toHaveLength(2);
    expect(series.trend.status).toBe('insufficient-data');
  });

  it('is empty when nothing is logged', () => {
    const series = assembleWeightSeries([], range4, REF_DATE);
    expect(series.hasData).toBe(false);
    expect(series.points).toHaveLength(0);
  });
});

describe('assembleWaistSeries', () => {
  it('reports a change once there are at least two readings', () => {
    const measurements: MeasurementRow[] = [
      { atIso: '2026-07-01T07:00:00.000Z', type: 'waist', value: 92 },
      { atIso: '2026-07-11T07:00:00.000Z', type: 'waist', value: 90.5 },
    ];
    const series = assembleWaistSeries(measurements, range4);
    expect(series.hasData).toBe(true);
    expect(series.change.status).toBe('available');
    if (series.change.status === 'available') {
      expect(series.change.changeCm).toBe(-1.5);
      expect(series.change.count).toBe(2);
    }
  });

  it('is insufficient with a single reading (raw point still shown)', () => {
    const series = assembleWaistSeries(
      [{ atIso: '2026-07-11T07:00:00.000Z', type: 'waist', value: 90 }],
      range4,
    );
    expect(series.hasData).toBe(true);
    expect(series.points).toHaveLength(1);
    expect(series.change.status).toBe('insufficient');
  });
});

describe('assembleAdherenceSeries', () => {
  it('computes completed-of-planned per week and totals, ignoring rest and replaced', () => {
    const sessions: SessionRow[] = [
      session('s1', '2026-07-08', 'strength'),
      session('s2', '2026-07-10', 'cardio'),
      session('s3', '2026-07-12', 'rest'), // not adherence-relevant
      session('s4', '2026-07-09', 'strength', 'replaced'), // superseded
      session('s5', '2026-06-17', 'strength'), // in the oldest bucket
    ];
    const logs: WorkoutLogRow[] = [completedLog('s1'), completedLog('s5')];
    const series = assembleAdherenceSeries(sessions, logs, buckets4);
    expect(series.totalPlanned).toBe(3); // s1, s2, s5
    expect(series.totalCompleted).toBe(2); // s1, s5
    // Last bucket (07-07..07-13): planned s1,s2 -> 1 of 2 = 50%.
    expect(series.bars[3]!.value).toBe(50);
    // A week with nothing planned shows null, not 0 %.
    expect(series.bars[1]!.value).toBeNull();
    expect(series.hasData).toBe(true);
  });

  it('is empty when nothing is planned', () => {
    const series = assembleAdherenceSeries([], [], buckets4);
    expect(series.hasData).toBe(false);
    expect(series.bars.every((bar) => bar.value === null)).toBe(true);
  });
});

describe('assembleStrengthSeries', () => {
  it('counts completed strength sessions per week', () => {
    const sessions: SessionRow[] = [
      session('a', '2026-07-08', 'strength'),
      session('b', '2026-07-11', 'strength'),
      session('c', '2026-07-09', 'cardio'), // not strength
      session('d', '2026-06-18', 'strength'),
    ];
    const logs = [completedLog('a'), completedLog('b'), completedLog('d')];
    const series = assembleStrengthSeries(sessions, logs, buckets4);
    expect(series.total).toBe(3);
    expect(series.bars[3]!.value).toBe(2); // a, b in the last week
    expect(series.hasData).toBe(true);
  });

  it('does not count an incomplete strength session', () => {
    const series = assembleStrengthSeries(
      [session('a', '2026-07-08', 'strength')],
      [],
      buckets4,
    );
    expect(series.total).toBe(0);
    expect(series.hasData).toBe(false);
  });
});

describe('assembleCardioSeries', () => {
  it('sums completed cardio minutes per week', () => {
    const series = assembleCardioSeries(
      [
        {
          durationSeconds: 1800,
          startedAtIso: '2026-07-10T09:00:00.000Z',
          status: 'completed',
        },
        {
          durationSeconds: 1200,
          startedAtIso: '2026-07-12T09:00:00.000Z',
          status: 'completed',
        },
        {
          durationSeconds: 600,
          startedAtIso: '2026-07-11T09:00:00.000Z',
          status: 'in_progress',
        }, // not counted
      ],
      buckets4,
    );
    expect(series.totalMinutes).toBe(50); // (1800 + 1200) / 60
    expect(series.bars[3]!.value).toBe(50);
    expect(series.hasData).toBe(true);
  });

  it('uses the local-day boundary so a just-after-midnight session is in the right week', () => {
    // 2026-07-13T00:30 local (BST) = 2026-07-12T23:30Z; with the BST offset it belongs to
    // the last bucket, not the previous one.
    const bstBuckets = weeklyBuckets(REF_DAY, 4, -60);
    const series = assembleCardioSeries(
      [
        {
          durationSeconds: 1800,
          startedAtIso: '2026-07-12T23:30:00.000Z',
          status: 'completed',
        },
      ],
      bstBuckets,
    );
    expect(series.bars[3]!.value).toBe(30);
    expect(series.bars[2]!.value).toBe(0);
  });
});

describe('assembleProteinSeries', () => {
  it('averages grams per day across the seven-day week and carries the target', () => {
    const series = assembleProteinSeries(
      [
        { loggedAtIso: '2026-07-08T12:00:00.000Z', proteinG: 140 },
        { loggedAtIso: '2026-07-10T12:00:00.000Z', proteinG: 140 },
        { loggedAtIso: '2026-07-12T19:00:00.000Z', proteinG: 140 },
      ],
      buckets4,
      140,
    );
    // Last week: 420 g over 7 days = 60 g/day average.
    expect(series.bars[3]!.value).toBe(60);
    expect(series.targetG).toBe(140);
    expect(series.hasData).toBe(true);
    // A week with no food shows null, not a misleading 0.
    expect(series.bars[0]!.value).toBeNull();
  });

  it('is empty with no logs and carries a null target honestly', () => {
    const series = assembleProteinSeries([], buckets4, null);
    expect(series.hasData).toBe(false);
    expect(series.targetG).toBeNull();
    expect(series.averagePerDay).toBeNull();
  });
});

describe('assembleLagerSeries', () => {
  it('totals units per week, neutrally', () => {
    const series = assembleLagerSeries(
      [
        { loggedAtIso: '2026-07-10T20:00:00.000Z', units: 2.84 },
        { loggedAtIso: '2026-07-10T21:00:00.000Z', units: 2.84 },
        { loggedAtIso: '2026-06-17T20:00:00.000Z', units: 3 },
      ],
      buckets4,
    );
    expect(series.totalUnits).toBe(8.68);
    expect(series.bars[3]!.value).toBe(5.68);
    expect(series.hasData).toBe(true);
  });

  it('shows a real zero for an alcohol-free week (information, not absence)', () => {
    const series = assembleLagerSeries([], buckets4);
    expect(series.hasData).toBe(false);
    expect(series.bars.every((bar) => bar.value === 0)).toBe(true);
  });
});

describe('window size', () => {
  it('produces one bar per week for both the 4-week and 12-week views', () => {
    const four = assembleLagerSeries([], buckets4);
    const twelve = assembleLagerSeries([], buckets12);
    expect(four.bars).toHaveLength(4);
    expect(twelve.bars).toHaveLength(12);
  });
});
