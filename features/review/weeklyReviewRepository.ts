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

import { summariseAlcoholWeek } from '@/domain/alcohol/alcoholUnits';
import {
  evaluateWeightTrend,
  type TrendMeasurement,
} from '@/domain/measurements/weightTrend';
import {
  evaluateCalorieAdjustment,
  type CalorieAdjustmentDecision,
} from '@/domain/nutrition/calorieAdjustment';
import {
  countNutritionDaysInWindow,
  dayWindow,
} from '@/domain/nutrition/nutritionDiary';
import { summariseProteinWeek } from '@/domain/nutrition/proteinReport';
import { resolveCurrentNutritionTarget } from '@/domain/nutrition/nutritionTargets';
import {
  assembleWeeklyReview,
  type SurfacedProposal,
  type WeeklyReview,
  type WeeklyReviewMetrics,
  type WeeklyReviewRecommendation,
} from '@/domain/review/weeklyReview';
import { computeWeeklyAdherence } from '@/domain/training/todaySession';
import type { Database, Json } from '@/lib/supabase';

type BackendError = { message: string } | null;

// The five-minute-day boundary window is the user's LOCAL calendar day (dayWindow), so every
// count and total agrees with the food diary and alcohol summary. offsetMinutes follows
// Date.getTimezoneOffset().
const DAY_MS = 24 * 60 * 60 * 1000;

// Step back `n` whole calendar days from a YYYY-MM-DD date, returning YYYY-MM-DD. Pure UTC
// date-part arithmetic, immune to DST (calendar counting, not elapsed time).
function shiftDay(dayIso: string, n: number): string {
  const parts = dayIso.split('-');
  const shifted = new Date(
    Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2])) -
      n * DAY_MS,
  );
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Whole days between two YYYY-MM-DD dates (later minus earlier), by calendar date parts.
function daysBetween(earlierDay: string, laterDay: string): number {
  const a = earlierDay.split('-');
  const b = laterDay.split('-');
  const earlier = Date.UTC(Number(a[0]), Number(a[1]) - 1, Number(a[2]));
  const later = Date.UTC(Number(b[0]), Number(b[1]) - 1, Number(b[2]));
  return Math.round((later - earlier) / DAY_MS);
}

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

// --- Raw rows for generation (the caller's own, RLS-scoped) -----------------

type RawConfig = {
  calorie_floor: number;
  adaptive_adjustments_enabled: boolean;
  weekly_alcohol_unit_limit: number | null;
};
type RawTargetRow = {
  effective_from: string;
  calories: number;
  protein_g: number;
};
type RawMeasurementRow = {
  measurement_type: 'weight' | 'waist';
  value: number;
  measured_at: string;
};
type RawSessionRow = { id: string; session_type: string; status: string };
type RawWorkoutLogRow = {
  scheduled_session_id: string | null;
  status: string;
};
type RawNutritionLogRow = { logged_at: string; protein_g: number };
type RawDrinkRow = {
  id: string;
  logged_at: string;
  units: number;
  calories: number;
};
type RawStrengthProposalRow = {
  id: string;
  decision: string;
  proposed_weight_kg: number | null;
  current_weight_kg: number | null;
  reasons: Json;
  inputs: Json;
  rule_version: string;
};
type RawRunningProposalRow = {
  id: string;
  decision: string;
  from_stage_number: number;
  to_stage_number: number;
  reasons: Json;
  inputs: Json;
  rule_version: string;
};

export type ConfirmChangeInput = {
  reviewId: string;
  source: 'calorie' | 'strength' | 'running';
  action: 'accepted' | 'dismissed';
  // The device-local today, for a newly-applied calorie target's effective_from.
  effectiveFromIso?: string | null;
  proposalId?: string | null;
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

  // --- Generation inputs (roadmap 23 wires real data into the roadmap-22 engines) ---
  fetchConfig(): Promise<{ data: RawConfig | null; error: BackendError }>;
  fetchTargets(): Promise<{ data: RawTargetRow[] | null; error: BackendError }>;
  fetchMeasurements(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawMeasurementRow[] | null; error: BackendError }>;
  fetchSessions(
    startDay: string,
    endDay: string,
  ): Promise<{ data: RawSessionRow[] | null; error: BackendError }>;
  fetchWorkoutLogs(
    sessionIds: string[],
  ): Promise<{ data: RawWorkoutLogRow[] | null; error: BackendError }>;
  fetchNutritionLogs(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawNutritionLogRow[] | null; error: BackendError }>;
  fetchDrinks(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawDrinkRow[] | null; error: BackendError }>;
  fetchStrengthProposals(): Promise<{
    data: RawStrengthProposalRow[] | null;
    error: BackendError;
  }>;
  fetchRunningProposal(): Promise<{
    data: RawRunningProposalRow | null;
    error: BackendError;
  }>;

  // The atomic confirm RPC (apply + mark review + audit in one transaction).
  confirmChange(input: ConfirmChangeInput): Promise<{ error: BackendError }>;
};

export type SaveReviewResult =
  | { status: 'saved'; id: string }
  // Offline: the write is server-side, so it fails honestly rather than pretending it saved.
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type LoadReviewResult =
  | { status: 'ready'; review: StoredWeeklyReview | null }
  | { status: 'error'; message: string };

export type GenerateReviewResult =
  | { status: 'saved'; review: StoredWeeklyReview }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type ConfirmResult =
  | { status: 'confirmed' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

// The period a generated review covers: the seven days ending on the reference day.
export const REVIEW_PERIOD_DAYS = 7;
// The calorie-adjustment nutrition-logging window (docs/06 §6.7): the last fourteen days.
export const NUTRITION_WINDOW_DAYS = 14;

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

    async fetchConfig() {
      const { data, error } = await client
        .from('profiles')
        .select(
          'calorie_floor, adaptive_adjustments_enabled, weekly_alcohol_unit_limit',
        )
        .maybeSingle();
      return { data: data as RawConfig | null, error };
    },
    async fetchTargets() {
      const { data, error } = await client
        .from('nutrition_targets')
        .select('effective_from, calories, protein_g')
        .order('effective_from', { ascending: false });
      return { data: data as RawTargetRow[] | null, error };
    },
    async fetchMeasurements(startIso, endIso) {
      const { data, error } = await client
        .from('body_measurements')
        .select('measurement_type, value, measured_at')
        .gte('measured_at', startIso)
        .lte('measured_at', endIso)
        .order('measured_at', { ascending: true });
      return { data: data as RawMeasurementRow[] | null, error };
    },
    async fetchSessions(startDay, endDay) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, session_type, status')
        .gte('scheduled_date', startDay)
        .lte('scheduled_date', endDay)
        .neq('status', 'replaced');
      return { data: data as RawSessionRow[] | null, error };
    },
    async fetchWorkoutLogs(sessionIds) {
      if (sessionIds.length === 0) {
        return { data: [], error: null };
      }
      const { data, error } = await client
        .from('workout_logs')
        .select('scheduled_session_id, status')
        .in('scheduled_session_id', sessionIds);
      return { data: data as RawWorkoutLogRow[] | null, error };
    },
    async fetchNutritionLogs(startIso, endIso) {
      const { data, error } = await client
        .from('nutrition_logs')
        .select('logged_at, protein_g')
        .gte('logged_at', startIso)
        .lte('logged_at', endIso);
      return { data: data as RawNutritionLogRow[] | null, error };
    },
    async fetchDrinks(startIso, endIso) {
      const { data, error } = await client
        .from('alcohol_logs')
        .select('id, logged_at, units, calories')
        .gte('logged_at', startIso)
        .lte('logged_at', endIso);
      return { data: data as RawDrinkRow[] | null, error };
    },
    async fetchStrengthProposals() {
      const { data, error } = await client
        .from('progression_proposals')
        .select(
          'id, decision, proposed_weight_kg, current_weight_kg, reasons, inputs, rule_version',
        )
        .eq('status', 'proposed')
        .order('created_at', { ascending: false });
      return { data: data as RawStrengthProposalRow[] | null, error };
    },
    async fetchRunningProposal() {
      const { data, error } = await client
        .from('running_progression_proposals')
        .select(
          'id, decision, from_stage_number, to_stage_number, reasons, inputs, rule_version',
        )
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data: data as RawRunningProposalRow | null, error };
    },
    async confirmChange(input) {
      const { error } = await client.rpc('confirm_weekly_review_change', {
        p_action: input.action,
        p_review_id: input.reviewId,
        p_source: input.source,
        ...(input.effectiveFromIso
          ? { p_effective_from: input.effectiveFromIso }
          : {}),
        ...(input.proposalId ? { p_proposal_id: input.proposalId } : {}),
      });
      return { error };
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

// A short British-English headline for a surfaced strength proposal, re-derived from its
// stored decision (one source of wording, no long strings persisted twice).
function strengthSummary(row: RawStrengthProposalRow): string {
  switch (row.decision) {
    case 'increase':
      return row.proposed_weight_kg !== null
        ? `Ready to add weight — try about ${row.proposed_weight_kg} kg next time.`
        : 'Ready to add a little weight next time.';
    case 'reduce_or_substitute':
      return 'Ease the weight back or switch to a gentler variation next time.';
    case 'hold':
    default:
      return 'Hold the current weight and repeat next time.';
  }
}

function runningSummary(row: RawRunningProposalRow): string {
  switch (row.decision) {
    case 'advance':
      return `Ready to progress — you could move up to stage ${row.to_stage_number}.`;
    case 'regress':
      return 'Ease back a stage for now rather than progressing.';
    case 'pause':
      return 'Pause progression at this stage for now.';
    case 'repeat':
    default:
      return 'Repeat this stage next time — there is no rush.';
  }
}

function toSurfacedStrength(row: RawStrengthProposalRow): SurfacedProposal {
  return {
    decision: row.decision,
    evidence: row.inputs as unknown,
    proposalId: row.id,
    reasons: (row.reasons as unknown as SurfacedProposal['reasons']) ?? [],
    ruleVersion: row.rule_version,
    status: 'proposed',
    summary: strengthSummary(row),
  };
}

function toSurfacedRunning(row: RawRunningProposalRow): SurfacedProposal {
  return {
    decision: row.decision,
    evidence: row.inputs as unknown,
    proposalId: row.id,
    reasons: (row.reasons as unknown as SurfacedProposal['reasons']) ?? [],
    ruleVersion: row.rule_version,
    status: 'proposed',
    summary: runningSummary(row),
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

    // Gather the week's real data, feed the pure roadmap-22 engines, assemble the review
    // and upsert it. The heavy lifting stays in the pure modules (weightTrend, calorie
    // adjustment, protein report, alcohol summary, adherence, the assembler); this only
    // wires real rows in. `referenceDayIso` is the device-local today; `offsetMinutes`
    // (Date.getTimezoneOffset()) frames every window as the user's LOCAL calendar day so
    // the nutrition-day count and per-day totals agree with the food diary.
    //
    // The crux is the nutrition-day count: it is a LOCAL-day count over the last fourteen
    // days (countNutritionDaysInWindow), the roadmap-22 seam this roadmap closes and the
    // exact input the calorie eligibility gate depends on.
    async generateReview(input: {
      userId: string;
      referenceDayIso: string;
      offsetMinutes: number;
      invalidatingEvent?: boolean;
    }): Promise<GenerateReviewResult> {
      const { offsetMinutes, referenceDayIso, userId } = input;
      const periodStart = shiftDay(referenceDayIso, REVIEW_PERIOD_DAYS - 1);
      const nutritionStart = shiftDay(
        referenceDayIso,
        NUTRITION_WINDOW_DAYS - 1,
      );
      const periodWindow = {
        endIso: dayWindow(referenceDayIso, offsetMinutes).endIso,
        startIso: dayWindow(periodStart, offsetMinutes).startIso,
      };
      const nutritionWindow = {
        endIso: dayWindow(referenceDayIso, offsetMinutes).endIso,
        startIso: dayWindow(nutritionStart, offsetMinutes).startIso,
      };
      // Measurements: a generous window so the trend engine can apply its own 14-day gate.
      const measurementStart = dayWindow(
        shiftDay(referenceDayIso, 27),
        offsetMinutes,
      ).startIso;

      // Config (the calorie floor / adaptive toggle / alcohol limit).
      const configResult = await backend.fetchConfig();
      if (configResult.error) {
        return looksOffline(configResult.error)
          ? { status: 'offline' }
          : { message: READ_ERROR, status: 'error' };
      }
      const config = configResult.data;

      const targetsResult = await backend.fetchTargets();
      if (targetsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const targetRows = targetsResult.data ?? [];
      const currentTarget = resolveCurrentNutritionTarget(
        targetRows.map((row) => ({
          calories: row.calories,
          effectiveFrom: row.effective_from,
          proteinG: row.protein_g,
        })),
        referenceDayIso,
      );
      const daysSinceTargetBegan = currentTarget
        ? daysBetween(currentTarget.effectiveFrom, referenceDayIso)
        : null;

      const measurementsResult = await backend.fetchMeasurements(
        measurementStart,
        periodWindow.endIso,
      );
      if (measurementsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const measurements: TrendMeasurement[] = (
        measurementsResult.data ?? []
      ).map((row) => ({
        measuredAt: row.measured_at,
        type: row.measurement_type,
        value: row.value,
      }));
      const weightTrend = evaluateWeightTrend(
        measurements,
        new Date(periodWindow.endIso),
      );

      // Adherence over the review week.
      const sessionsResult = await backend.fetchSessions(
        periodStart,
        referenceDayIso,
      );
      if (sessionsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const sessions = sessionsResult.data ?? [];
      const logsResult = await backend.fetchWorkoutLogs(
        sessions.map((session) => session.id),
      );
      if (logsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const adherence = computeWeeklyAdherence(
        sessions.map((session) => ({
          id: session.id,
          sessionType: session.session_type,
        })),
        (logsResult.data ?? []).map((log) => ({
          scheduledSessionId: log.scheduled_session_id,
          status: log.status,
        })),
      );

      // Nutrition over the 14-day window: the LOCAL-day count AND the 7-day protein totals.
      const nutritionResult = await backend.fetchNutritionLogs(
        nutritionWindow.startIso,
        nutritionWindow.endIso,
      );
      if (nutritionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const nutritionLogs = (nutritionResult.data ?? []).map((row) => ({
        loggedAtIso: row.logged_at,
        proteinG: row.protein_g,
      }));
      const nutritionLoggedDayCount = countNutritionDaysInWindow(
        nutritionLogs,
        nutritionStart,
        referenceDayIso,
        offsetMinutes,
      );
      // Per-day protein totals over the review week for the §6.8 report.
      const dailyProteinG: number[] = [];
      for (let i = REVIEW_PERIOD_DAYS - 1; i >= 0; i -= 1) {
        const dayIso = shiftDay(referenceDayIso, i);
        const { endIso, startIso } = dayWindow(dayIso, offsetMinutes);
        const total = nutritionLogs
          .filter(
            (log) => log.loggedAtIso >= startIso && log.loggedAtIso <= endIso,
          )
          .reduce((sum, log) => sum + log.proteinG, 0);
        dailyProteinG.push(Math.round(total * 100) / 100);
      }
      const proteinReport = summariseProteinWeek(
        dailyProteinG,
        currentTarget?.proteinG ?? 140,
      );

      // Alcohol summary over the review week.
      const drinksResult = await backend.fetchDrinks(
        periodWindow.startIso,
        periodWindow.endIso,
      );
      if (drinksResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const alcohol = summariseAlcoholWeek(
        (drinksResult.data ?? []).map((row) => ({
          calories: row.calories,
          id: row.id,
          loggedAtIso: row.logged_at,
          units: row.units,
        })),
        referenceDayIso,
        offsetMinutes,
        config?.weekly_alcohol_unit_limit ?? null,
      );

      // The calorie decision (docs/06 §6.7). Fail-safe: any missing input a gate needs is
      // treated as unmet by the engine, so insufficient logging always means no change.
      const calorie: CalorieAdjustmentDecision = evaluateCalorieAdjustment({
        adaptiveAdjustmentsEnabled:
          config?.adaptive_adjustments_enabled ?? true,
        adherencePercent: adherence.percent,
        calorieFloor: config?.calorie_floor ?? 1500,
        currentTarget: currentTarget
          ? { calories: currentTarget.calories }
          : null,
        daysSinceTargetBegan,
        invalidatingEvent: input.invalidatingEvent === true,
        nutritionLoggedDayCount,
        weightTrend,
      });

      // Surfaced strength / running proposals (READ, not re-run).
      const strengthResult = await backend.fetchStrengthProposals();
      if (strengthResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const strengthProposals = (strengthResult.data ?? []).map(
        toSurfacedStrength,
      );
      const runningResult = await backend.fetchRunningProposal();
      if (runningResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const runningProposal = runningResult.data
        ? toSurfacedRunning(runningResult.data)
        : null;

      const review = assembleWeeklyReview({
        adherence,
        alcohol,
        calorie,
        period: { end: referenceDayIso, start: periodStart },
        proteinReport,
        runningProposal,
        strengthProposals,
        weightTrend,
      });

      const saved = await backend.upsertReview({
        acceptedChanges: null,
        metrics: review.metrics as unknown as Json,
        periodEnd: referenceDayIso,
        periodStart,
        recommendations: review.recommendations as unknown as Json,
        ruleVersion: review.ruleVersion,
        userId,
      });
      if (saved.error) {
        return looksOffline(saved.error)
          ? { status: 'offline' }
          : { message: saved.error.message || SAVE_ERROR, status: 'error' };
      }
      if (!saved.data) {
        return { message: SAVE_ERROR, status: 'error' };
      }
      return {
        review: {
          acceptedChanges: null,
          id: saved.data.id,
          metrics: review.metrics,
          periodEnd: referenceDayIso,
          periodStart,
          recommendations: review.recommendations,
          reviewedAt: null,
          ruleVersion: review.ruleVersion,
        },
        status: 'saved',
      };
    },

    // Confirm a single recommendation through the atomic RPC. Applying the change, marking
    // the review and writing the audit event all happen in one transaction server-side, so
    // nothing half-succeeds. Nothing is applied until this is called (the user's confirm).
    async confirmChange(input: ConfirmChangeInput): Promise<ConfirmResult> {
      const { error } = await backend.confirmChange(input);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return { status: 'confirmed' };
    },
  };
}

export type WeeklyReviewRepository = ReturnType<
  typeof createWeeklyReviewRepository
>;
