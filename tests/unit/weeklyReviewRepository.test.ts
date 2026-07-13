import { describe, expect, it, jest } from '@jest/globals';

import type { WeeklyReview } from '@/domain/review/weeklyReview';
import {
  createWeeklyReviewRepository,
  type WeeklyReviewBackend,
} from '@/features/review/weeklyReviewRepository';

function backend(overrides: Partial<WeeklyReviewBackend>): WeeklyReviewBackend {
  return {
    fetchLatestReview: jest.fn<WeeklyReviewBackend['fetchLatestReview']>(
      async () => ({ data: null, error: null }),
    ),
    fetchReview: jest.fn<WeeklyReviewBackend['fetchReview']>(async () => ({
      data: null,
      error: null,
    })),
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
