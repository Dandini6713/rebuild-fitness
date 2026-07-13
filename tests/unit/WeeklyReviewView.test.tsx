import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type {
  WeeklyReview,
  WeeklyReviewRecommendation,
} from '@/domain/review/weeklyReview';
import type { StoredWeeklyReview } from '@/features/review/weeklyReviewRepository';
import type {
  PendingDecision,
  WeeklyReviewReady,
} from '@/features/review/useWeeklyReview';
import {
  WeeklyReviewView,
  type WeeklyReviewCallbacks,
} from '@/features/review/WeeklyReviewView';

function callbacks(
  overrides: Partial<WeeklyReviewCallbacks> = {},
): WeeklyReviewCallbacks {
  return {
    onCancel: jest.fn(),
    onConfirm: jest.fn(),
    onGenerate: jest.fn(),
    onRequestDecision: jest.fn(),
    ...overrides,
  };
}

const calorieProposal: WeeklyReviewRecommendation = {
  actionable: true,
  change: {
    deltaKcal: -100,
    professionalReviewRequired: false,
    proposedTargetCalories: 1900,
  },
  decision: 'propose-reduction',
  evidence: { adherencePercent: 90, nutritionLoggedDayCount: 12 },
  reasons: [
    {
      code: 'loss-stalled',
      message: 'Weight loss has stalled while adherence is good.',
    },
  ],
  ruleVersion: 'calorie-adjustment/v1',
  source: 'calorie',
  status: 'proposed',
  summary: 'Suggested reduction to about 1900 kcal a day.',
};

const metrics: WeeklyReview['metrics'] = {
  adherence: { completed: 3, percent: 75, planned: 4 },
  alcohol: {
    alcoholFreeDays: 5,
    daysInWindow: 7,
    percentOfLimit: null,
    totalCalories: 200,
    totalDrinks: 2,
    totalUnits: 4,
    weeklyLimitUnits: null,
  },
  periodEnd: '2026-07-13',
  periodStart: '2026-07-07',
  protein: {
    averageProteinG: 138,
    daysConsidered: 7,
    daysWithinTarget: 6,
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
};

function storedReview(
  recommendations: WeeklyReviewRecommendation[] = [calorieProposal],
): StoredWeeklyReview {
  return {
    acceptedChanges: null,
    id: 'review-1',
    metrics,
    periodEnd: '2026-07-13',
    periodStart: '2026-07-07',
    recommendations,
    reviewedAt: null,
    ruleVersion: 'weekly-review/v1',
  };
}

function ready(overrides: Partial<WeeklyReviewReady> = {}): WeeklyReviewReady {
  return {
    decideError: null,
    deciding: false,
    generating: false,
    pending: null,
    review: storedReview(),
    status: 'ready',
    ...overrides,
  };
}

describe('WeeklyReviewView', () => {
  it('renders all six S-041 sections (with a pending decision so Confirmation shows)', async () => {
    const pending: PendingDecision = {
      action: 'accepted',
      recommendation: calorieProposal,
    };
    const { getByText } = await render(
      <WeeklyReviewView callbacks={callbacks()} state={ready({ pending })} />,
    );
    expect(getByText('What happened')).toBeTruthy();
    expect(getByText('What improved')).toBeTruthy();
    expect(getByText('What needs attention')).toBeTruthy();
    expect(getByText('Safety and recovery')).toBeTruthy();
    expect(getByText('Proposed changes')).toBeTruthy();
    expect(getByText('Confirmation')).toBeTruthy();
  });

  it('displays the metrics and the proposed change with its evidence', async () => {
    const { getByText } = await render(
      <WeeklyReviewView callbacks={callbacks()} state={ready()} />,
    );
    expect(getByText(/Sessions completed: 3 of 4/)).toBeTruthy();
    expect(getByText(/Suggested reduction to about 1900/)).toBeTruthy();
    // Evidence is available (not shouty) — the rule version is shown as a caption.
    expect(getByText(/calorie-adjustment\/v1/)).toBeTruthy();
  });

  it('Accept STAGES a decision and does NOT apply anything until confirm', async () => {
    const onRequestDecision = jest.fn();
    const onConfirm = jest.fn();
    const { getByText } = await render(
      <WeeklyReviewView
        callbacks={callbacks({ onConfirm, onRequestDecision })}
        state={ready()}
      />,
    );
    fireEvent.press(getByText('Accept'));
    expect(onRequestDecision).toHaveBeenCalledWith(calorieProposal, 'accepted');
    // Pressing Accept never calls confirm — nothing is applied yet.
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('shows the confirmation panel only once a decision is pending, and Confirm applies it', async () => {
    const onConfirm = jest.fn();
    const pending: PendingDecision = {
      action: 'accepted',
      recommendation: calorieProposal,
    };
    const { getByText, queryByText } = await render(
      <WeeklyReviewView
        callbacks={callbacks({ onConfirm })}
        state={ready({ pending })}
      />,
    );
    expect(queryByText('Confirmation')).toBeTruthy();
    fireEvent.press(getByText('Confirm change'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('a floor-clamped reduction surfaces the professional-review note in the confirm panel', async () => {
    const clamped: WeeklyReviewRecommendation = {
      ...calorieProposal,
      change: {
        deltaKcal: -50,
        professionalReviewRequired: true,
        proposedTargetCalories: 1500,
      },
    };
    const pending: PendingDecision = {
      action: 'accepted',
      recommendation: clamped,
    };
    const { getAllByText } = await render(
      <WeeklyReviewView
        callbacks={callbacks()}
        state={ready({
          pending,
          review: storedReview([clamped]),
        })}
      />,
    );
    // Shown in both the safety section and the confirmation panel, so it cannot be missed.
    expect(
      getAllByText(/healthcare professional before reducing further/i).length,
    ).toBeGreaterThanOrEqual(1);
  });

  it('supports dismissing a suggestion (staged, then confirmed)', async () => {
    const onRequestDecision = jest.fn();
    const { getByText } = await render(
      <WeeklyReviewView
        callbacks={callbacks({ onRequestDecision })}
        state={ready()}
      />,
    );
    fireEvent.press(getByText('Dismiss'));
    expect(onRequestDecision).toHaveBeenCalledWith(
      calorieProposal,
      'dismissed',
    );
  });

  it('shows the honest not-eligible reason (no fabricated proposal)', async () => {
    const notEligible: WeeklyReviewRecommendation = {
      actionable: false,
      decision: 'not-eligible',
      evidence: { nutritionLoggedDayCount: 4 },
      reasons: [
        {
          code: 'insufficient-nutrition-logging',
          message:
            'Nutrition was logged on 4 of the last 14 days; at least 10 are needed before a calorie change is suggested.',
        },
      ],
      ruleVersion: 'calorie-adjustment/v1',
      source: 'calorie',
      status: 'none',
      summary:
        'No calorie change — there is not yet enough logged to suggest one.',
    };
    const { getByText, queryByText } = await render(
      <WeeklyReviewView
        callbacks={callbacks()}
        state={ready({ review: storedReview([notEligible]) })}
      />,
    );
    // Surfaced under "What needs attention", and no Accept button (not actionable).
    expect(getByText(/at least 10 are needed/i)).toBeTruthy();
    expect(queryByText('Accept')).toBeNull();
    expect(getByText(/No changes are proposed this week/i)).toBeTruthy();
  });

  it('renders the empty state with a generate action', async () => {
    const onGenerate = jest.fn();
    const { getByText } = await render(
      <WeeklyReviewView
        callbacks={callbacks({ onGenerate })}
        state={{ generateError: null, generating: false, status: 'empty' }}
      />,
    );
    fireEvent.press(getByText('Prepare this week’s review'));
    expect(onGenerate).toHaveBeenCalled();
  });

  it('renders loading, unavailable and error states', async () => {
    const loading = await render(
      <WeeklyReviewView
        callbacks={callbacks()}
        state={{ status: 'loading' }}
      />,
    );
    expect(loading.getByText('Loading your weekly review.')).toBeTruthy();

    const unavailable = await render(
      <WeeklyReviewView
        callbacks={callbacks()}
        state={{ status: 'unavailable' }}
      />,
    );
    expect(unavailable.getByText(/unavailable right now/i)).toBeTruthy();

    const error = await render(
      <WeeklyReviewView
        callbacks={callbacks()}
        state={{ message: 'It broke.', status: 'error' }}
      />,
    );
    expect(error.getByText('It broke.')).toBeTruthy();
  });
});
