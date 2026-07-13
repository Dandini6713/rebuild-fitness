import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type { WeeklyReviewRecommendation } from '@/domain/review/weeklyReview';
import type {
  StoredWeeklyReview,
  WeeklyReviewRepository,
} from '@/features/review/weeklyReviewRepository';
import { useWeeklyReview } from '@/features/review/useWeeklyReview';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = new Date('2026-07-13T09:00:00.000Z');

const calorie: WeeklyReviewRecommendation = {
  actionable: true,
  change: {
    deltaKcal: -100,
    professionalReviewRequired: false,
    proposedTargetCalories: 1900,
  },
  decision: 'propose-reduction',
  evidence: {},
  reasons: [],
  ruleVersion: 'calorie-adjustment/v1',
  source: 'calorie',
  status: 'proposed',
  summary: 'Suggested reduction.',
};

function stored(
  recommendations: WeeklyReviewRecommendation[] = [calorie],
): StoredWeeklyReview {
  return {
    acceptedChanges: null,
    id: 'review-1',
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
        changePerWeekKg: -0.05,
        direction: 'steady',
        status: 'trend',
        trendKg: 84,
      },
    },
    periodEnd: '2026-07-13',
    periodStart: '2026-07-07',
    recommendations,
    reviewedAt: null,
    ruleVersion: 'weekly-review/v1',
  };
}

function repository(
  overrides: Partial<WeeklyReviewRepository> = {},
): WeeklyReviewRepository {
  return {
    confirmChange: jest.fn<WeeklyReviewRepository['confirmChange']>(
      async () => ({ status: 'confirmed' }),
    ),
    generateReview: jest.fn<WeeklyReviewRepository['generateReview']>(
      async () => ({ review: stored(), status: 'saved' }),
    ),
    loadLatestReview: jest.fn<WeeklyReviewRepository['loadLatestReview']>(
      async () => ({ review: stored(), status: 'ready' }),
    ),
    loadReview: jest.fn<WeeklyReviewRepository['loadReview']>(async () => ({
      review: {
        ...stored([{ ...calorie, status: 'accepted' }]),
        reviewedAt: '2026-07-13T09:00:00.000Z',
      },
      status: 'ready',
    })),
    saveReview: jest.fn<WeeklyReviewRepository['saveReview']>(async () => ({
      id: 'review-1',
      status: 'saved',
    })),
    ...overrides,
  } as unknown as WeeklyReviewRepository;
}

describe('useWeeklyReview', () => {
  it('loads the latest stored review', async () => {
    const repo = repository();
    const { result } = await renderHook(() =>
      useWeeklyReview({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('requesting a decision STAGES it but applies NOTHING until confirm', async () => {
    const confirmChange = jest.fn<WeeklyReviewRepository['confirmChange']>(
      async () => ({ status: 'confirmed' }),
    );
    const repo = repository({ confirmChange });
    const { result } = await renderHook(() =>
      useWeeklyReview({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.requestDecision(calorie, 'accepted');
    });
    // A pending decision is staged, but the repository was NOT called.
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.pending).not.toBeNull();
    expect(confirmChange).not.toHaveBeenCalled();
  });

  it('confirmPending applies the staged decision through the RPC', async () => {
    const confirmChange = jest.fn<WeeklyReviewRepository['confirmChange']>(
      async () => ({ status: 'confirmed' }),
    );
    const repo = repository({ confirmChange });
    const { result } = await renderHook(() =>
      useWeeklyReview({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.requestDecision(calorie, 'accepted');
    });
    await act(async () => {
      result.current.confirmPending();
    });
    expect(confirmChange).toHaveBeenCalledWith({
      action: 'accepted',
      effectiveFromIso: '2026-07-13',
      proposalId: null,
      reviewId: 'review-1',
      source: 'calorie',
    });
  });

  it('cancelling a pending decision clears it without applying', async () => {
    const confirmChange = jest.fn<WeeklyReviewRepository['confirmChange']>(
      async () => ({ status: 'confirmed' }),
    );
    const repo = repository({ confirmChange });
    const { result } = await renderHook(() =>
      useWeeklyReview({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.requestDecision(calorie, 'accepted');
    });
    await act(async () => {
      result.current.cancelPending();
    });
    const state = result.current.state;
    if (state.status !== 'ready') throw new Error('expected ready');
    expect(state.pending).toBeNull();
    expect(confirmChange).not.toHaveBeenCalled();
  });

  it('generates the current week when none is stored yet', async () => {
    const generateReview = jest.fn<WeeklyReviewRepository['generateReview']>(
      async () => ({ review: stored(), status: 'saved' }),
    );
    const repo = repository({
      generateReview,
      loadLatestReview: jest.fn<WeeklyReviewRepository['loadLatestReview']>(
        async () => ({ review: null, status: 'ready' }),
      ),
    });
    const { result } = await renderHook(() =>
      useWeeklyReview({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('empty'));
    await act(async () => {
      result.current.generate();
    });
    expect(generateReview).toHaveBeenCalledWith({
      offsetMinutes: NOW.getTimezoneOffset(),
      referenceDayIso: expect.any(String),
      userId: 'user-1',
    });
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });
});
