import { describe, expect, it } from '@jest/globals';

import {
  createProgressDashboardRepository,
  type ProgressDashboardBackend,
} from '@/features/progress/progressDashboardRepository';

const REF_DAY = '2026-07-13';
const REF_DATE = new Date('2026-07-13T12:00:00.000Z');

// A backend that returns canned rows and records the windows it was asked for, so the
// composition (windowing + assembly) can be verified without Supabase.
function backend(
  overrides: Partial<ProgressDashboardBackend> = {},
): ProgressDashboardBackend {
  return {
    fetchAlcoholLogs: async () => ({ data: [], error: null }),
    fetchCardioLogs: async () => ({ data: [], error: null }),
    fetchMeasurements: async () => ({ data: [], error: null }),
    fetchNutritionLogs: async () => ({ data: [], error: null }),
    fetchProteinTarget: async () => ({ data: [], error: null }),
    fetchSessions: async () => ({ data: [], error: null }),
    fetchWorkoutLogs: async () => ({ data: [], error: null }),
    ...overrides,
  };
}

describe('progress dashboard repository', () => {
  it('composes every series over the requested window', async () => {
    let sessionWindow: { startDay: string; endDay: string } | null = null;
    const repo = createProgressDashboardRepository(
      backend({
        fetchSessions: async (startDay, endDay) => {
          sessionWindow = { endDay, startDay };
          return {
            data: [
              {
                id: 's1',
                scheduled_date: '2026-07-10',
                session_type: 'strength',
                status: 'planned',
              },
            ],
            error: null,
          };
        },
        fetchWorkoutLogs: async () => ({
          data: [{ scheduled_session_id: 's1', status: 'completed' }],
          error: null,
        }),
        fetchAlcoholLogs: async () => ({
          data: [{ logged_at: '2026-07-11T20:00:00.000Z', units: 2.84 }],
          error: null,
        }),
        fetchProteinTarget: async () => ({
          data: [{ effective_from: '2026-01-01', protein_g: 140 }],
          error: null,
        }),
        fetchNutritionLogs: async () => ({
          data: [{ logged_at: '2026-07-11T12:00:00.000Z', protein_g: 140 }],
          error: null,
        }),
        fetchMeasurements: async () => ({
          data: [
            {
              measured_at: '2026-07-11T07:00:00.000Z',
              measurement_type: 'weight',
              value: 80,
            },
            {
              measured_at: '2026-07-01T07:00:00.000Z',
              measurement_type: 'waist',
              value: 92,
            },
            {
              measured_at: '2026-07-10T07:00:00.000Z',
              measurement_type: 'waist',
              value: 91,
            },
          ],
          error: null,
        }),
      }),
    );

    const result = await repo.load(REF_DAY, 4, 0, REF_DATE);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    const data = result.data;
    expect(data.weeks).toBe(4);
    expect(data.buckets).toHaveLength(4);
    // Sessions were fetched over the local-date span (28 days ending on today).
    expect(sessionWindow).toEqual({
      endDay: '2026-07-13',
      startDay: '2026-06-16',
    });
    // The series were assembled from the canned rows.
    expect(data.strength.total).toBe(1);
    expect(data.adherence.totalCompleted).toBe(1);
    expect(data.lager.totalUnits).toBe(2.84);
    expect(data.protein.targetG).toBe(140);
    expect(data.weight.hasData).toBe(true);
    expect(data.waist.change.status).toBe('available');
  });

  it('returns an error result when a fetch fails, not a half-built dashboard', async () => {
    const repo = createProgressDashboardRepository(
      backend({
        fetchCardioLogs: async () => ({
          data: null,
          error: { message: 'boom' },
        }),
      }),
    );
    const result = await repo.load(REF_DAY, 12, 0, REF_DATE);
    expect(result.status).toBe('error');
  });

  it('does not fetch workout logs when there are no sessions', async () => {
    let called = false;
    const repo = createProgressDashboardRepository(
      backend({
        fetchSessions: async () => ({ data: [], error: null }),
        fetchWorkoutLogs: async () => {
          called = true;
          return { data: [], error: null };
        },
      }),
    );
    const result = await repo.load(REF_DAY, 4, 0, REF_DATE);
    expect(result.status).toBe('ready');
    expect(called).toBe(false);
  });
});
