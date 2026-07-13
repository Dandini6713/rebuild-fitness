// Drives the weekly review surface (roadmap 23, docs/03 S-041, docs/06 §6.7/§6.10). It
// loads the most recent stored review (or lets the user generate the current week's), and
// runs the CONFIRM-BEFORE-APPLY flow: tapping Accept or Dismiss only STAGES a decision;
// nothing is applied until the user taps the final Confirm, which calls the atomic RPC
// (apply the change + mark the review + write the audit event, all in one transaction).
//
// The rules live in the pure roadmap-22 engines (the review was assembled from them); this
// hook only wires state and the repository, and the view renders what it returns. Nothing
// here diagnoses or assesses anything (docs/07): a proposal is a suggestion the user
// confirms or sets aside, never applied automatically.

import { useCallback, useEffect, useState } from 'react';

import type { WeeklyReviewRecommendation } from '@/domain/review/weeklyReview';
import { toIsoDate } from '@/domain/training/todaySession';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultWeeklyReviewRepository } from './defaultWeeklyReviewRepository';
import type {
  StoredWeeklyReview,
  WeeklyReviewRepository,
} from './weeklyReviewRepository';

// A decision the user has requested but not yet confirmed. It applies nothing on its own —
// only confirmPending() calls the repository. This is the whole point of the two-step flow
// (docs/10 §10.2 "No change applies without confirmation").
export type PendingDecision = {
  recommendation: WeeklyReviewRecommendation;
  action: 'accepted' | 'dismissed';
};

export type WeeklyReviewReady = {
  status: 'ready';
  review: StoredWeeklyReview;
  generating: boolean;
  pending: PendingDecision | null;
  deciding: boolean;
  decideError: string | null;
};

export type WeeklyReviewState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'empty'; generating: boolean; generateError: string | null }
  | WeeklyReviewReady;

export type UseWeeklyReviewValue = {
  state: WeeklyReviewState;
  generate: () => void;
  requestDecision: (
    recommendation: WeeklyReviewRecommendation,
    action: 'accepted' | 'dismissed',
  ) => void;
  cancelPending: () => void;
  confirmPending: () => void;
  reload: () => void;
};

const DECIDE_ERROR =
  'We could not confirm that change. Check your connection and try again.';
const GENERATE_ERROR =
  'We could not put your review together. Check your connection and try again.';
const OFFLINE_ERROR =
  'You appear to be offline. Reconnect and try again — nothing has changed.';

export function useWeeklyReview(
  options: {
    now?: Date;
    repository?: WeeklyReviewRepository | null;
  } = {},
): UseWeeklyReviewValue {
  const repository =
    options.repository === undefined
      ? defaultWeeklyReviewRepository
      : options.repository;

  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const reference = options.now ?? undefined;
  const referenceDayIso = toIsoDate(reference ?? new Date());
  const offsetMinutes = (reference ?? new Date()).getTimezoneOffset();

  const [review, setReview] = useState<StoredWeeklyReview | null>(null);
  const [loadState, setLoadState] = useState<
    'loading' | 'empty' | 'error' | 'ready'
  >('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [pending, setPending] = useState<PendingDecision | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setReview(null);
    setLoadState('loading');
    setLoadError(null);
    setGenerateError(null);
    setPending(null);
    setDecideError(null);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (repository === null || !userId) {
      return;
    }
    let active = true;
    void repository.loadLatestReview().then((result) => {
      if (!active) {
        return;
      }
      if (result.status === 'error') {
        setLoadError(result.message);
        setLoadState('error');
      } else if (result.review) {
        setReview(result.review);
        setLoadState('ready');
      } else {
        setLoadState('empty');
      }
    });
    return () => {
      active = false;
    };
  }, [reloadKey, repository, userId]);

  const generate = useCallback(() => {
    if (repository === null || !userId || generating) {
      return;
    }
    setGenerating(true);
    setGenerateError(null);
    void repository
      .generateReview({ offsetMinutes, referenceDayIso, userId })
      .then((result) => {
        setGenerating(false);
        if (result.status === 'saved') {
          setReview(result.review);
          setLoadState('ready');
        } else if (result.status === 'offline') {
          setGenerateError(OFFLINE_ERROR);
        } else {
          setGenerateError(result.message || GENERATE_ERROR);
        }
      });
  }, [generating, offsetMinutes, referenceDayIso, repository, userId]);

  const requestDecision = useCallback(
    (
      recommendation: WeeklyReviewRecommendation,
      action: 'accepted' | 'dismissed',
    ) => {
      if (deciding) {
        return;
      }
      setDecideError(null);
      setPending({ action, recommendation });
    },
    [deciding],
  );

  const cancelPending = useCallback(() => {
    if (deciding) {
      return;
    }
    setPending(null);
    setDecideError(null);
  }, [deciding]);

  const confirmPending = useCallback(() => {
    if (repository === null || !review || !pending || deciding) {
      return;
    }
    const { action, recommendation } = pending;
    setDeciding(true);
    setDecideError(null);
    void repository
      .confirmChange({
        action,
        effectiveFromIso:
          recommendation.source === 'calorie' && action === 'accepted'
            ? referenceDayIso
            : null,
        proposalId: recommendation.proposalId ?? null,
        reviewId: review.id,
        source: recommendation.source,
      })
      .then((result) => {
        if (result.status === 'confirmed') {
          // Re-read the stored review so the recommendation's new status shows.
          void repository
            .loadReview(review.periodStart, review.periodEnd)
            .then((reloaded) => {
              setDeciding(false);
              setPending(null);
              if (reloaded.status === 'ready' && reloaded.review) {
                setReview(reloaded.review);
              }
            });
          return;
        }
        setDeciding(false);
        setDecideError(
          result.status === 'offline'
            ? OFFLINE_ERROR
            : result.message || DECIDE_ERROR,
        );
      });
  }, [deciding, pending, referenceDayIso, repository, review]);

  let state: WeeklyReviewState;
  if (repository === null) {
    state = { status: 'unavailable' };
  } else if (loadState === 'error') {
    state = { message: loadError ?? GENERATE_ERROR, status: 'error' };
  } else if (loadState === 'ready' && review) {
    state = {
      decideError,
      deciding,
      generating,
      pending,
      review,
      status: 'ready',
    };
  } else if (loadState === 'empty') {
    state = { generateError, generating, status: 'empty' };
  } else {
    state = { status: 'loading' };
  }

  return {
    cancelPending,
    confirmPending,
    generate,
    reload,
    requestDecision,
    state,
  };
}
