// Server boundary for the progress dashboard (roadmap 21, docs/03 S-040). Mirrors
// features/today/todayRepository.ts: a narrow backend interface keeps the composition
// testable, and a Supabase adapter implements it against the RLS-protected, owner-scoped
// tables. Every read only ever sees the caller's own rows because RLS enforces
// auth.uid() = user_id.
//
// This is a READ-ONLY DISPLAY feature. It computes no new rules and writes nothing — no
// trusted RPC, and none is needed. It reads the data other roadmaps produce (measurements
// R18, adherence from the scheduling/log tables, cardio R16, protein R19, alcohol R20)
// and hands it to the pure assemblers in domain/progress. The weekly review (roadmap 22)
// is a separate screen that will reuse these same calculations.

import type { SupabaseClient } from '@supabase/supabase-js';

import { resolveCurrentNutritionTarget } from '@/domain/nutrition/nutritionTargets';
import {
  assembleAdherenceSeries,
  assembleCardioSeries,
  assembleLagerSeries,
  assembleProteinSeries,
  assembleStrengthSeries,
  assembleWaistSeries,
  assembleWeightSeries,
  type AdherenceSeries,
  type CardioSeries,
  type LagerSeries,
  type MeasurementRow,
  type ProteinSeries,
  type StrengthSeries,
  type WaistSeries,
  type WeightSeries,
} from '@/domain/progress/progressSeries';
import {
  weeklyBuckets,
  windowRange,
  type WeekBucket,
} from '@/domain/progress/progressWindows';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

type RawSession = {
  id: string;
  scheduled_date: string;
  session_type: string;
  status: string;
};
type RawWorkoutLog = { scheduled_session_id: string | null; status: string };
type RawCardioLog = {
  started_at: string;
  duration_seconds: number | null;
  status: string;
};
type RawNutritionLog = { logged_at: string; protein_g: number };
type RawAlcoholLog = { logged_at: string; units: number };
type RawMeasurement = {
  measurement_type: 'weight' | 'waist';
  value: number;
  measured_at: string;
};
type RawTarget = { protein_g: number; effective_from: string };

// The backend fetches each table once over the whole window. Sessions are keyed by their
// date column (a local date), everything else by its UTC timestamp column.
export type ProgressDashboardBackend = {
  fetchSessions(
    startDay: string,
    endDay: string,
  ): Promise<{ data: RawSession[] | null; error: BackendError }>;
  fetchWorkoutLogs(
    sessionIds: string[],
  ): Promise<{ data: RawWorkoutLog[] | null; error: BackendError }>;
  fetchCardioLogs(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawCardioLog[] | null; error: BackendError }>;
  fetchNutritionLogs(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawNutritionLog[] | null; error: BackendError }>;
  fetchAlcoholLogs(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawAlcoholLog[] | null; error: BackendError }>;
  fetchMeasurements(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawMeasurement[] | null; error: BackendError }>;
  fetchProteinTarget(
    todayIso: string,
  ): Promise<{ data: RawTarget[] | null; error: BackendError }>;
};

export type DashboardData = {
  weeks: number;
  buckets: WeekBucket[];
  weight: WeightSeries;
  waist: WaistSeries;
  adherence: AdherenceSeries;
  strength: StrengthSeries;
  cardio: CardioSeries;
  protein: ProteinSeries;
  lager: LagerSeries;
};

export type DashboardResult =
  | { status: 'ready'; data: DashboardData }
  | { status: 'error'; message: string };

const READ_ERROR =
  'We could not load your progress. Check your connection and try again.';

export function createSupabaseProgressBackend(
  client: SupabaseClient<Database>,
): ProgressDashboardBackend {
  return {
    async fetchAlcoholLogs(startIso, endIso) {
      const { data, error } = await client
        .from('alcohol_logs')
        .select('logged_at, units')
        .gte('logged_at', startIso)
        .lte('logged_at', endIso);
      return { data, error };
    },

    async fetchCardioLogs(startIso, endIso) {
      const { data, error } = await client
        .from('cardio_logs')
        .select('started_at, duration_seconds, status')
        .gte('started_at', startIso)
        .lte('started_at', endIso);
      return { data, error };
    },

    async fetchMeasurements(startIso, endIso) {
      const { data, error } = await client
        .from('body_measurements')
        .select('measurement_type, value, measured_at')
        .gte('measured_at', startIso)
        .lte('measured_at', endIso)
        .order('measured_at', { ascending: true });
      return { data: data as RawMeasurement[] | null, error };
    },

    async fetchNutritionLogs(startIso, endIso) {
      const { data, error } = await client
        .from('nutrition_logs')
        .select('logged_at, protein_g')
        .gte('logged_at', startIso)
        .lte('logged_at', endIso);
      return { data, error };
    },

    async fetchProteinTarget(todayIso) {
      const { data, error } = await client
        .from('nutrition_targets')
        .select('protein_g, effective_from')
        .lte('effective_from', todayIso)
        .order('effective_from', { ascending: false });
      return { data, error };
    },

    async fetchSessions(startDay, endDay) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, scheduled_date, session_type, status')
        .gte('scheduled_date', startDay)
        .lte('scheduled_date', endDay);
      return { data, error };
    },

    async fetchWorkoutLogs(sessionIds) {
      const { data, error } = await client
        .from('workout_logs')
        .select('scheduled_session_id, status')
        .in('scheduled_session_id', sessionIds);
      return { data, error };
    },
  };
}

export function createProgressDashboardRepository(
  backend: ProgressDashboardBackend,
) {
  return {
    // Load every series for the given window. `referenceDayIso` is the local "today";
    // `weeks` is 4 or 12; `offsetMinutes` (Date.getTimezoneOffset()) frames every window
    // as the user's LOCAL calendar day, matching the food diary and alcohol summary.
    async load(
      referenceDayIso: string,
      weeks: number,
      offsetMinutes: number,
      referenceDate: Date,
    ): Promise<DashboardResult> {
      const range = windowRange(referenceDayIso, weeks, offsetMinutes);
      const buckets = weeklyBuckets(referenceDayIso, weeks, offsetMinutes);

      const sessionResult = await backend.fetchSessions(
        range.startDay,
        range.endDay,
      );
      if (sessionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const sessions = sessionResult.data ?? [];

      let workoutLogs: RawWorkoutLog[] = [];
      const sessionIds = sessions.map((session) => session.id);
      if (sessionIds.length > 0) {
        const logResult = await backend.fetchWorkoutLogs(sessionIds);
        if (logResult.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        workoutLogs = logResult.data ?? [];
      }

      const [cardio, nutrition, alcohol, measurements, target] =
        await Promise.all([
          backend.fetchCardioLogs(range.startIso, range.endIso),
          backend.fetchNutritionLogs(range.startIso, range.endIso),
          backend.fetchAlcoholLogs(range.startIso, range.endIso),
          backend.fetchMeasurements(range.startIso, range.endIso),
          backend.fetchProteinTarget(referenceDayIso),
        ]);
      if (
        cardio.error ||
        nutrition.error ||
        alcohol.error ||
        measurements.error ||
        target.error
      ) {
        return { message: READ_ERROR, status: 'error' };
      }

      const measurementRows: MeasurementRow[] = (measurements.data ?? []).map(
        (row) => ({
          atIso: row.measured_at,
          type: row.measurement_type,
          value: row.value,
        }),
      );

      const sessionRows = sessions.map((session) => ({
        id: session.id,
        scheduledDate: session.scheduled_date,
        sessionType: session.session_type,
        status: session.status,
      }));
      const workoutLogRows = workoutLogs.map((log) => ({
        scheduledSessionId: log.scheduled_session_id,
        status: log.status,
      }));

      const currentTarget = resolveCurrentNutritionTarget(
        (target.data ?? []).map((row) => ({
          calories: 0,
          effectiveFrom: row.effective_from,
          proteinG: row.protein_g,
        })),
        referenceDayIso,
      );

      return {
        data: {
          adherence: assembleAdherenceSeries(
            sessionRows,
            workoutLogRows,
            buckets,
          ),
          buckets,
          cardio: assembleCardioSeries(
            (cardio.data ?? []).map((row) => ({
              durationSeconds: row.duration_seconds,
              startedAtIso: row.started_at,
              status: row.status,
            })),
            buckets,
          ),
          lager: assembleLagerSeries(
            (alcohol.data ?? []).map((row) => ({
              loggedAtIso: row.logged_at,
              units: row.units,
            })),
            buckets,
          ),
          protein: assembleProteinSeries(
            (nutrition.data ?? []).map((row) => ({
              loggedAtIso: row.logged_at,
              proteinG: row.protein_g,
            })),
            buckets,
            currentTarget?.proteinG ?? null,
          ),
          strength: assembleStrengthSeries(
            sessionRows,
            workoutLogRows,
            buckets,
          ),
          waist: assembleWaistSeries(measurementRows, {
            endIso: range.endIso,
            startIso: range.startIso,
          }),
          weeks,
          weight: assembleWeightSeries(
            measurementRows,
            { endIso: range.endIso, startIso: range.startIso },
            referenceDate,
          ),
        },
        status: 'ready',
      };
    },
  };
}

export type ProgressDashboardRepository = ReturnType<
  typeof createProgressDashboardRepository
>;
