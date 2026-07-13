import { describe, expect, it, jest } from '@jest/globals';

import type { WeeklyReview } from '@/domain/review/weeklyReview';
import {
  createWeeklyReviewRepository,
  type WeeklyReviewBackend,
} from '@/features/review/weeklyReviewRepository';

function backend(overrides: Partial<WeeklyReviewBackend>): WeeklyReviewBackend {
  return {
    confirmChange: jest.fn<WeeklyReviewBackend['confirmChange']>(async () => ({
      error: null,
    })),
    fetchConfig: jest.fn<WeeklyReviewBackend['fetchConfig']>(async () => ({
      data: {
        adaptive_adjustments_enabled: true,
        calorie_floor: 1500,
        weekly_alcohol_unit_limit: null,
      },
      error: null,
    })),
    fetchDrinks: jest.fn<WeeklyReviewBackend['fetchDrinks']>(async () => ({
      data: [],
      error: null,
    })),
    fetchLatestReview: jest.fn<WeeklyReviewBackend['fetchLatestReview']>(
      async () => ({ data: null, error: null }),
    ),
    fetchMeasurements: jest.fn<WeeklyReviewBackend['fetchMeasurements']>(
      async () => ({ data: [], error: null }),
    ),
    fetchNutritionLogs: jest.fn<WeeklyReviewBackend['fetchNutritionLogs']>(
      async () => ({ data: [], error: null }),
    ),
    fetchReview: jest.fn<WeeklyReviewBackend['fetchReview']>(async () => ({
      data: null,
      error: null,
    })),
    fetchRunningProposal: jest.fn<WeeklyReviewBackend['fetchRunningProposal']>(
      async () => ({ data: null, error: null }),
    ),
    fetchSessions: jest.fn<WeeklyReviewBackend['fetchSessions']>(async () => ({
      data: [],
      error: null,
    })),
    fetchStrengthProposals: jest.fn<
      WeeklyReviewBackend['fetchStrengthProposals']
    >(async () => ({ data: [], error: null })),
    fetchTargets: jest.fn<WeeklyReviewBackend['fetchTargets']>(async () => ({
      data: [],
      error: null,
    })),
    fetchWorkoutLogs: jest.fn<WeeklyReviewBackend['fetchWorkoutLogs']>(
      async () => ({ data: [], error: null }),
    ),
    upsertReview: jest.fn<WeeklyReviewBackend['upsertReview']>(async () => ({
      data: { id: 'review-1' },
      error: null,
    })),
    ...overrides,
  };
}

const review: WeeklyReview = {
  metrics: {
    adherence: { completed: 3, percent: 75, planned: 4 },
    alcohol: {
      alcoholFreeDays: 5,
      daysInWindow: 7,
      percentOfLimit: null,
      totalCalories: 0,
      totalDrinks: 0,
      totalUnits: 0,
      weeklyLimitUnits: null,
    },
    periodEnd: '2026-07-13',
    periodStart: '2026-07-07',
    protein: {
      averageProteinG: 140,
      daysConsidered: 7,
      daysWithinTarget: 7,
      ruleVersion: 'protein-report/v1',
      targetProteinG: 140,
      tolerancePercent: 10,
    },
    weightTrend: {
      changePerWeekKg: -0.4,
      direction: 'falling',
      status: 'trend',
      trendKg: 84,
    },
  },
  recommendations: [
    {
      actionable: false,
      decision: 'no-change',
      evidence: { minNutritionDays: 10 },
      reasons: [{ code: 'loss-within-range', message: 'On track.' }],
      ruleVersion: 'calorie-adjustment/v1',
      source: 'calorie',
      status: 'none',
      summary: 'No calorie change suggested.',
    },
  ],
  ruleVersion: 'weekly-review/v1',
};

describe('weekly review repository — save', () => {
  it('upserts the review and returns its id', async () => {
    const upsertReview = jest.fn<WeeklyReviewBackend['upsertReview']>(
      async () => ({ data: { id: 'review-9' }, error: null }),
    );
    const repo = createWeeklyReviewRepository(backend({ upsertReview }));
    const result = await repo.saveReview({
      periodEnd: '2026-07-13',
      periodStart: '2026-07-07',
      review,
      userId: 'u1',
    });
    expect(upsertReview).toHaveBeenCalledTimes(1);
    const arg = upsertReview.mock.calls[0]![0];
    expect(arg).toMatchObject({
      periodEnd: '2026-07-13',
      periodStart: '2026-07-07',
      ruleVersion: 'weekly-review/v1',
      userId: 'u1',
    });
    expect(arg.acceptedChanges).toBeNull();
    expect(result).toEqual({ id: 'review-9', status: 'saved' });
  });

  it('passes accepted changes through when supplied', async () => {
    const upsertReview = jest.fn<WeeklyReviewBackend['upsertReview']>(
      async () => ({ data: { id: 'review-1' }, error: null }),
    );
    const repo = createWeeklyReviewRepository(backend({ upsertReview }));
    await repo.saveReview({
      acceptedChanges: [{ source: 'calorie', target: 1900 }],
      periodEnd: '2026-07-13',
      periodStart: '2026-07-07',
      review,
      userId: 'u1',
    });
    expect(upsertReview.mock.calls[0]![0].acceptedChanges).toEqual([
      { source: 'calorie', target: 1900 },
    ]);
  });

  it('fails honestly as offline on a network-shaped error', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        upsertReview: async () => ({
          data: null,
          error: { message: 'Failed to fetch' },
        }),
      }),
    );
    const result = await repo.saveReview({
      periodEnd: '2026-07-13',
      periodStart: '2026-07-07',
      review,
      userId: 'u1',
    });
    expect(result.status).toBe('offline');
  });

  it('surfaces a real (non-network) error', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        upsertReview: async () => ({
          data: null,
          error: { message: 'value violates check constraint' },
        }),
      }),
    );
    const result = await repo.saveReview({
      periodEnd: '2026-07-13',
      periodStart: '2026-07-07',
      review,
      userId: 'u1',
    });
    expect(result.status).toBe('error');
  });
});

describe('weekly review repository — read', () => {
  const rawRow = {
    accepted_changes: null,
    id: 'review-5',
    metrics: review.metrics as unknown,
    period_end: '2026-07-13',
    period_start: '2026-07-07',
    recommendations: review.recommendations as unknown,
    reviewed_at: null,
    rule_version: 'weekly-review/v1',
  };

  it('loads a stored review for a period and maps it to camelCase', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        fetchReview: async () => ({ data: rawRow as never, error: null }),
      }),
    );
    const result = await repo.loadReview('2026-07-07', '2026-07-13');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.review?.id).toBe('review-5');
    expect(result.review?.ruleVersion).toBe('weekly-review/v1');
    expect(result.review?.recommendations[0]?.source).toBe('calorie');
  });

  it('returns a null review when none exists for the period', async () => {
    const repo = createWeeklyReviewRepository(backend({}));
    const result = await repo.loadReview('2026-07-07', '2026-07-13');
    expect(result).toEqual({ review: null, status: 'ready' });
  });

  it('loads the latest review as the minimal accessor', async () => {
    const fetchLatestReview = jest.fn<WeeklyReviewBackend['fetchLatestReview']>(
      async () => ({ data: rawRow as never, error: null }),
    );
    const repo = createWeeklyReviewRepository(backend({ fetchLatestReview }));
    const result = await repo.loadLatestReview();
    expect(fetchLatestReview).toHaveBeenCalledTimes(1);
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.review?.id).toBe('review-5');
  });

  it('reports a read error when the query fails', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        fetchReview: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    );
    const result = await repo.loadReview('2026-07-07', '2026-07-13');
    expect(result.status).toBe('error');
  });
});

describe('weekly review repository — generate', () => {
  // A window with enough logging and a downward trend that should propose a reduction:
  // stalled loss (< 0.1 kg/week) with high adherence. Fourteen days of nutrition logs and
  // a settled 30-day-old target satisfy the eligibility gate.
  const referenceDay = '2026-07-13';

  function fourteenDaysOfNutrition() {
    // One log per day for the last 14 local days (UTC offset 0), so the LOCAL-day count is
    // 14 (>= 10) — the seam this roadmap closes.
    const rows: { logged_at: string; protein_g: number }[] = [];
    for (let i = 0; i < 14; i += 1) {
      const day = new Date(Date.UTC(2026, 6, 13) - i * 86_400_000);
      rows.push({
        logged_at: new Date(day.getTime() + 12 * 3_600_000).toISOString(),
        protein_g: 140,
      });
    }
    return rows;
  }

  function weightMeasurements() {
    // Enough weigh-ins for the trend engine (>=3 in 7, >=6 in 14), essentially flat so loss
    // is below 0.1 kg/week.
    const rows: {
      measurement_type: 'weight';
      value: number;
      measured_at: string;
    }[] = [];
    for (let i = 0; i < 8; i += 1) {
      const day = new Date(Date.UTC(2026, 6, 13) - i * 86_400_000);
      rows.push({
        measured_at: new Date(day.getTime() + 8 * 3_600_000).toISOString(),
        measurement_type: 'weight',
        value: 84,
      });
    }
    return rows;
  }

  it('gathers real data, feeds the engines and upserts the review', async () => {
    const upsertReview = jest.fn<WeeklyReviewBackend['upsertReview']>(
      async () => ({ data: { id: 'review-new' }, error: null }),
    );
    const repo = createWeeklyReviewRepository(
      backend({
        fetchMeasurements: async () => ({
          data: weightMeasurements(),
          error: null,
        }),
        fetchNutritionLogs: async () => ({
          data: fourteenDaysOfNutrition(),
          error: null,
        }),
        fetchTargets: async () => ({
          data: [
            { calories: 2000, effective_from: '2026-06-01', protein_g: 140 },
          ],
          error: null,
        }),
        upsertReview,
      }),
    );
    const result = await repo.generateReview({
      offsetMinutes: 0,
      referenceDayIso: referenceDay,
      userId: 'u1',
    });
    expect(result.status).toBe('saved');
    expect(upsertReview).toHaveBeenCalledTimes(1);
    const saved = upsertReview.mock.calls[0]![0];
    expect(saved.periodStart).toBe('2026-07-07');
    expect(saved.periodEnd).toBe('2026-07-13');
    if (result.status !== 'saved') return;
    expect(result.review.id).toBe('review-new');
    const calorie = result.review.recommendations.find(
      (r) => r.source === 'calorie',
    );
    // With sufficient logging, a settled target, high nothing-planned adherence null... the
    // gate passes and the calorie decision is present with its rule version.
    expect(calorie?.ruleVersion).toBe('calorie-adjustment/v1');
  });

  it('INSUFFICIENT nutrition logging yields a not-eligible calorie decision (no change)', async () => {
    // Only 3 days logged in the 14-day window — below the 10-day gate.
    const sparse = [
      { logged_at: '2026-07-13T12:00:00.000Z', protein_g: 140 },
      { logged_at: '2026-07-12T12:00:00.000Z', protein_g: 140 },
      { logged_at: '2026-07-11T12:00:00.000Z', protein_g: 140 },
    ];
    const repo = createWeeklyReviewRepository(
      backend({
        fetchMeasurements: async () => ({
          data: weightMeasurements(),
          error: null,
        }),
        fetchNutritionLogs: async () => ({ data: sparse, error: null }),
        fetchTargets: async () => ({
          data: [
            { calories: 2000, effective_from: '2026-06-01', protein_g: 140 },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.generateReview({
      offsetMinutes: 0,
      referenceDayIso: referenceDay,
      userId: 'u1',
    });
    if (result.status !== 'saved') throw new Error('expected saved');
    const calorie = result.review.recommendations.find(
      (r) => r.source === 'calorie',
    );
    expect(calorie?.decision).toBe('not-eligible');
    expect(calorie?.actionable).toBe(false);
    expect(calorie?.change).toBeUndefined();
  });

  it('surfaces a proposed strength proposal with its proposalId for the confirm path', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        fetchStrengthProposals: async () => ({
          data: [
            {
              current_weight_kg: 40,
              decision: 'increase',
              id: 'prop-1',
              inputs: { topOfRange: true },
              proposed_weight_kg: 42.5,
              reasons: [{ code: 'top', message: 'Top of range.' }],
              rule_version: 'strength-progression/v1',
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.generateReview({
      offsetMinutes: 0,
      referenceDayIso: referenceDay,
      userId: 'u1',
    });
    if (result.status !== 'saved') throw new Error('expected saved');
    const strength = result.review.recommendations.find(
      (r) => r.source === 'strength',
    );
    expect(strength?.proposalId).toBe('prop-1');
    expect(strength?.actionable).toBe(true);
  });

  it('fails offline when a gather query is network-shaped', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        fetchConfig: async () => ({
          data: null,
          error: { message: 'Failed to fetch' },
        }),
      }),
    );
    const result = await repo.generateReview({
      offsetMinutes: 0,
      referenceDayIso: referenceDay,
      userId: 'u1',
    });
    expect(result.status).toBe('offline');
  });
});

describe('weekly review repository — confirm', () => {
  it('passes the confirmation through to the RPC and reports confirmed', async () => {
    const confirmChange = jest.fn<WeeklyReviewBackend['confirmChange']>(
      async () => ({ error: null }),
    );
    const repo = createWeeklyReviewRepository(backend({ confirmChange }));
    const result = await repo.confirmChange({
      action: 'accepted',
      effectiveFromIso: '2026-07-13',
      reviewId: 'review-1',
      source: 'calorie',
    });
    expect(confirmChange).toHaveBeenCalledWith({
      action: 'accepted',
      effectiveFromIso: '2026-07-13',
      reviewId: 'review-1',
      source: 'calorie',
    });
    expect(result.status).toBe('confirmed');
  });

  it('fails honestly as offline on a network error', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        confirmChange: async () => ({ error: { message: 'network down' } }),
      }),
    );
    const result = await repo.confirmChange({
      action: 'dismissed',
      proposalId: 'prop-1',
      reviewId: 'review-1',
      source: 'strength',
    });
    expect(result.status).toBe('offline');
  });

  it('surfaces a real error from the RPC', async () => {
    const repo = createWeeklyReviewRepository(
      backend({
        confirmChange: async () => ({
          error: { message: 'recommendation has already been decided' },
        }),
      }),
    );
    const result = await repo.confirmChange({
      action: 'accepted',
      effectiveFromIso: '2026-07-13',
      reviewId: 'review-1',
      source: 'calorie',
    });
    expect(result.status).toBe('error');
  });
});
