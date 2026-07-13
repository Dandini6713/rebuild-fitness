// Server boundary for the weekly review (roadmap 22, docs/05 §5.7, docs/06 §6.7/§6.8). A
// thin repository over the owner-scoped, RLS-protected weekly_reviews table: it PERSISTS an
// assembled review and READS it back. Mirrors features/alcohol and features/nutrition — a
// narrow backend interface keeps the composition testable, and a Supabase adapter implements
// it. Every read only ever sees the caller's own rows because RLS enforces auth.uid() =
// user_id.
//
// The review is a stored RECORD (metrics + recommendations + rule version, each
// recommendation carrying its evidence and rule version). Saving one is a plain owner-scoped
// upsert under RLS — no trusted RPC, because the review is data the user owns and the
// safety-critical decision (the calorie eligibility) is made by the pure engine before it
// reaches here; nothing the client sends can smuggle in an ineligible change, because the
// engine is what produced the recommendation.
//
// The INTERFACE (the weekly-review screen and the accept/dismiss actions) is roadmap 23. A
// calorie proposal is accept-not-auto like the strength/running proposals, so acceptance is
// modelled here in the data shape — `acceptedChanges` on the row — for roadmap 23 to write;
// this repository does not apply any accepted change (applying an accepted calorie change to
// a new effective-dated nutrition_targets row is a roadmap-23 seam).

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  WeeklyReview,
  WeeklyReviewMetrics,
  WeeklyReviewRecommendation,
} from '@/domain/review/weeklyReview';
import type { Database, Json } from '@/lib/supabase';

type BackendError = { message: string } | null;

// The raw weekly_reviews row the adapter returns (jsonb columns come back as Json).
type RawReview = {
  id: string;
  period_start: string;
  period_end: string;
  metrics: Json;
  recommendations: Json;
  rule_version: string;
  accepted_changes: Json | null;
  reviewed_at: string | null;
};

export type StoredWeeklyReview = {
  id: string;
  periodStart: string;
  periodEnd: string;
  metrics: WeeklyReviewMetrics;
  recommendations: WeeklyReviewRecommendation[];
  ruleVersion: string;
  acceptedChanges: unknown | null;
  reviewedAt: string | null;
};

export type SaveReviewInput = {
  userId: string;
  periodStart: string;
  periodEnd: string;
  review: WeeklyReview;
  acceptedChanges?: unknown | null;
};

export type WeeklyReviewBackend = {
  // Insert or update the review for a period (unique on user_id, period_start, period_end),
  // so re-running a review for the same week overwrites the previous computation rather than
  // failing on the unique constraint.
  upsertReview(input: {
    userId: string;
    periodStart: string;
    periodEnd: string;
    metrics: Json;
    recommendations: Json;
    ruleVersion: string;
    acceptedChanges: Json | null;
  }): Promise<{ data: { id: string } | null; error: BackendError }>;
  fetchReview(
    periodStart: string,
    periodEnd: string,
  ): Promise<{ data: RawReview | null; error: BackendError }>;
  fetchLatestReview(): Promise<{ data: RawReview | null; error: BackendError }>;
};

export type SaveReviewResult =
  | { status: 'saved'; id: string }
  // Offline: the write is server-side, so it fails honestly rather than pretending it saved.
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type LoadReviewResult =
  | { status: 'ready'; review: StoredWeeklyReview | null }
  | { status: 'error'; message: string };

const SAVE_ERROR =
  'We could not save the weekly review. Check your connection and try again.';
const READ_ERROR =
  'We could not load your weekly review. Check your connection and try again.';

function looksOffline(error: { message?: string } | null): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
}

const REVIEW_COLUMNS =
  'id, period_start, period_end, metrics, recommendations, rule_version, accepted_changes, reviewed_at';

export function createSupabaseWeeklyReviewBackend(
  client: SupabaseClient<Database>,
): WeeklyReviewBackend {
  return {
    async upsertReview(input) {
      const { data, error } = await client
        .from('weekly_reviews')
        .upsert(
          {
            accepted_changes: input.acceptedChanges,
            metrics: input.metrics,
            period_end: input.periodEnd,
            period_start: input.periodStart,
            recommendations: input.recommendations,
            rule_version: input.ruleVersion,
            user_id: input.userId,
          },
          { onConflict: 'user_id,period_start,period_end' },
        )
        .select('id')
        .single();
      return { data: data ? { id: data.id } : null, error };
    },
    async fetchReview(periodStart, periodEnd) {
      const { data, error } = await client
        .from('weekly_reviews')
        .select(REVIEW_COLUMNS)
        .eq('period_start', periodStart)
        .eq('period_end', periodEnd)
        .maybeSingle();
      return { data: data as RawReview | null, error };
    },
    async fetchLatestReview() {
      const { data, error } = await client
        .from('weekly_reviews')
        .select(REVIEW_COLUMNS)
        .order('period_end', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data: data as RawReview | null, error };
    },
  };
}

function toStoredReview(raw: RawReview): StoredWeeklyReview {
  return {
    acceptedChanges: (raw.accepted_changes as unknown) ?? null,
    id: raw.id,
    metrics: raw.metrics as unknown as WeeklyReviewMetrics,
    periodEnd: raw.period_end,
    periodStart: raw.period_start,
    recommendations:
      raw.recommendations as unknown as WeeklyReviewRecommendation[],
    reviewedAt: raw.reviewed_at,
    ruleVersion: raw.rule_version,
  };
}

export function createWeeklyReviewRepository(backend: WeeklyReviewBackend) {
  return {
    // Persist an assembled review for its period. Idempotent per week via the upsert, so a
    // recomputed review replaces the previous one. `acceptedChanges` defaults to null — the
    // accept/dismiss interface is roadmap 23.
    async saveReview(input: SaveReviewInput): Promise<SaveReviewResult> {
      const { data, error } = await backend.upsertReview({
        acceptedChanges: (input.acceptedChanges ?? null) as Json | null,
        metrics: input.review.metrics as unknown as Json,
        periodEnd: input.periodEnd,
        periodStart: input.periodStart,
        recommendations: input.review.recommendations as unknown as Json,
        ruleVersion: input.review.ruleVersion,
        userId: input.userId,
      });
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return data
        ? { id: data.id, status: 'saved' }
        : { message: SAVE_ERROR, status: 'error' };
    },

    // Read the stored review for a specific period, or null when none exists yet.
    async loadReview(
      periodStart: string,
      periodEnd: string,
    ): Promise<LoadReviewResult> {
      const { data, error } = await backend.fetchReview(periodStart, periodEnd);
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      return { review: data ? toStoredReview(data) : null, status: 'ready' };
    },

    // The minimal accessor: the most recent stored review (by period end), or null when the
    // user has none. The roadmap-23 screen builds on this.
    async loadLatestReview(): Promise<LoadReviewResult> {
      const { data, error } = await backend.fetchLatestReview();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      return { review: data ? toStoredReview(data) : null, status: 'ready' };
    },
  };
}

export type WeeklyReviewRepository = ReturnType<
  typeof createWeeklyReviewRepository
>;
