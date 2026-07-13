// Server boundary for the Today screen. Mirrors features/plan/planRepository.ts:
// a narrow backend interface keeps the composition logic testable, and a Supabase
// adapter implements it against the RLS-protected, owner-scoped tables. Every read
// only ever sees the caller's own rows because RLS enforces auth.uid() = user_id.
//
// Starting a session (docs/03 S-010 primary action) goes through the trusted
// start_scheduled_session RPC (roadmap 14), NOT a direct workout_logs insert. A red
// readiness result must block a running or demanding-lower-body start and must not be
// overridable (docs/06 §6.5, docs/07 §7.4), so the enforcement lives server-side and
// workout_logs no longer grants the client INSERT. A blocked start comes back as a
// typed `blocked` failure the UI renders as the red result, never a connection error.

import type { SupabaseClient } from '@supabase/supabase-js';

import { isReadinessBlockError } from '@/domain/training/readinessClassification';
import {
  computeWeeklyAdherence,
  deriveTodaySessionState,
  type TodaySessionState,
  type WeeklyAdherence,
} from '@/domain/training/todaySession';
import { currentWeekRange } from '@/domain/training/planSchedule';
import {
  computeNutrientProgress,
  type NutrientProgress,
  resolveCurrentNutritionTarget,
} from '@/domain/nutrition/nutritionTargets';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

type SessionStatus = Database['public']['Enums']['session_status'];

type RawSession = {
  id: string;
  scheduled_date: string;
  session_type: string;
  status: SessionStatus;
  template_id: string | null;
};
type RawLog = {
  id: string;
  scheduled_session_id: string | null;
  status: SessionStatus;
};
type RawTemplate = { id: string; name: string };
type RawTarget = {
  calories: number;
  effective_from: string;
  protein_g: number;
};
type RawNutritionLog = { calories: number; protein_g: number };

export type TodayBackend = {
  fetchCurrentTargets(
    todayIso: string,
  ): Promise<{ data: RawTarget[] | null; error: BackendError }>;
  // Today's nutrition_logs (roadmap 19), so Today shows real calorie and protein
  // intake against the target, not just the target. Keyed by the day's time window.
  fetchDayNutrition(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawNutritionLog[] | null; error: BackendError }>;
  fetchTemplates(
    templateIds: string[],
  ): Promise<{ data: RawTemplate[] | null; error: BackendError }>;
  fetchWeekLogs(
    sessionIds: string[],
  ): Promise<{ data: RawLog[] | null; error: BackendError }>;
  fetchWeekSessions(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawSession[] | null; error: BackendError }>;
  startSession(input: {
    scheduledSessionId: string;
    startedAtIso: string;
    userId: string;
  }): Promise<{
    data: { id: string } | null;
    error: BackendError;
    // True when the server refused the start because the latest pre-session readiness
    // result is red (docs/06 §6.5). A block is not an error to retry — it is a result.
    blocked?: boolean;
  }>;
};

// Nutrition degrades on its own: a target may be set with, as yet, no way to log
// intake against it. Intake is null until the food-logging roadmap item lands.
export type DailyIntake = { calories: number; proteinG: number };
export type TodayNutrition =
  | { kind: 'no-target' }
  | {
      calories: number;
      caloriesProgress: NutrientProgress | null;
      effectiveFrom: string;
      kind: 'target';
      proteinG: number;
      proteinProgress: NutrientProgress | null;
    };

export type TodayReadModel = {
  adherence: WeeklyAdherence;
  nutrition: TodayNutrition;
  session: TodaySessionState;
};

export type TodayResult =
  | { data: TodayReadModel; status: 'ready' }
  | { message: string; status: 'error' };

export type StartResult =
  | { logId: string; success: true }
  // `blocked` distinguishes a red-readiness refusal (render the red result) from an
  // ordinary failure (render the error). Both carry a message for the fallback path.
  | { blocked: boolean; message: string; success: false };

export function createSupabaseTodayBackend(
  client: SupabaseClient<Database>,
): TodayBackend {
  return {
    async fetchWeekSessions(startIso, endIso) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, scheduled_date, session_type, status, template_id')
        .gte('scheduled_date', startIso)
        .lte('scheduled_date', endIso)
        .order('scheduled_date', { ascending: true });
      return { data, error };
    },

    async fetchWeekLogs(sessionIds) {
      const { data, error } = await client
        .from('workout_logs')
        .select('id, scheduled_session_id, status')
        .in('scheduled_session_id', sessionIds);
      return { data, error };
    },

    async fetchTemplates(templateIds) {
      const { data, error } = await client
        .from('workout_templates')
        .select('id, name')
        .in('id', templateIds);
      return { data, error };
    },

    async fetchCurrentTargets(todayIso) {
      const { data, error } = await client
        .from('nutrition_targets')
        .select('calories, effective_from, protein_g')
        .lte('effective_from', todayIso)
        .order('effective_from', { ascending: false });
      return { data, error };
    },

    async fetchDayNutrition(startIso, endIso) {
      const { data, error } = await client
        .from('nutrition_logs')
        .select('calories, protein_g')
        .gte('logged_at', startIso)
        .lte('logged_at', endIso);
      return { data, error };
    },

    async startSession({ scheduledSessionId, startedAtIso }) {
      // The trusted RPC captures auth.uid() itself and is the only writer of a
      // starting workout_logs row; the client no longer inserts directly. It returns
      // the new log id, or raises with the readiness-red-block marker when a red
      // pre-session result blocks a gated session.
      const { data, error } = await client.rpc('start_scheduled_session', {
        p_scheduled_session_id: scheduledSessionId,
        p_started_at: startedAtIso,
      });
      if (error) {
        return {
          blocked: isReadinessBlockError(error),
          data: null,
          error,
        };
      }
      return {
        data: typeof data === 'string' ? { id: data } : null,
        error: null,
      };
    },
  };
}

const READ_ERROR =
  'We could not load today. Check your connection and try again.';
const START_ERROR =
  'We could not start your session. Check your connection and try again.';
const START_BLOCKED =
  'This session will not start because your latest readiness check was red.';

// Sum a day's nutrition_logs into total intake. Calories are integers (an exact sum);
// protein grams are rounded to two decimals after summing so a long day never leaks
// binary floating-point error into the total.
function sumDayIntake(rows: RawNutritionLog[]): DailyIntake {
  let calories = 0;
  let proteinG = 0;
  for (const row of rows) {
    calories += row.calories;
    proteinG += row.protein_g;
  }
  return { calories, proteinG: Math.round(proteinG * 100) / 100 };
}

// Builds the nutrition section from the effective-dated targets and the day's intake
// (roadmap 19 wired the intake in). When a target is set, progress is computed against
// today's summed calories and protein; with no target the view shows "no target set".
function buildNutrition(
  targets: RawTarget[],
  todayIso: string,
  intake: DailyIntake | null,
): TodayNutrition {
  const current = resolveCurrentNutritionTarget(
    targets.map((target) => ({
      calories: target.calories,
      effectiveFrom: target.effective_from,
      proteinG: target.protein_g,
    })),
    todayIso,
  );
  if (!current) {
    return { kind: 'no-target' };
  }
  return {
    calories: current.calories,
    caloriesProgress: intake
      ? computeNutrientProgress(current.calories, intake.calories)
      : null,
    effectiveFrom: current.effectiveFrom,
    kind: 'target',
    proteinG: current.proteinG,
    proteinProgress: intake
      ? computeNutrientProgress(current.proteinG, intake.proteinG)
      : null,
  };
}

export function createTodayRepository(backend: TodayBackend) {
  return {
    async load(todayIso: string): Promise<TodayResult> {
      const { end, start } = currentWeekRange(todayIso);

      const sessionResult = await backend.fetchWeekSessions(start, end);
      if (sessionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const weekSessions = sessionResult.data ?? [];

      const sessionIds = weekSessions.map((session) => session.id);
      let weekLogs: RawLog[] = [];
      if (sessionIds.length > 0) {
        const logResult = await backend.fetchWeekLogs(sessionIds);
        if (logResult.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        weekLogs = logResult.data ?? [];
      }

      // An amber activity substitution (roadmap 15) leaves the original session
      // 'replaced' on the same date as its live replacement. Prefer the live one so
      // Today shows the replacement, with the superseded original only in the planner's
      // history.
      const todaysSessions = weekSessions.filter(
        (session) => session.scheduled_date === todayIso,
      );
      const todaysRaw =
        todaysSessions.find((session) => session.status !== 'replaced') ??
        todaysSessions[0] ??
        null;

      let templateName: string | null = null;
      if (todaysRaw?.template_id) {
        const templateResult = await backend.fetchTemplates([
          todaysRaw.template_id,
        ]);
        if (templateResult.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        templateName =
          templateResult.data?.find(
            (template) => template.id === todaysRaw.template_id,
          )?.name ?? null;
      }

      const todaysLog =
        weekLogs.find((log) => log.scheduled_session_id === todaysRaw?.id) ??
        null;

      const session = deriveTodaySessionState(
        todaysRaw
          ? {
              id: todaysRaw.id,
              scheduledDate: todaysRaw.scheduled_date,
              sessionType: todaysRaw.session_type,
              status: todaysRaw.status,
              templateName,
            }
          : null,
        todaysLog ? { status: todaysLog.status } : null,
      );

      const adherence = computeWeeklyAdherence(
        // A 'replaced' original (roadmap 15 substitution) is superseded by its
        // replacement, so it does not count towards what there is to adhere to; the
        // replacement it created does.
        weekSessions
          .filter((sessionRow) => sessionRow.status !== 'replaced')
          .map((sessionRow) => ({
            id: sessionRow.id,
            sessionType: sessionRow.session_type,
          })),
        weekLogs.map((log) => ({
          scheduledSessionId: log.scheduled_session_id,
          status: log.status,
        })),
      );

      const targetResult = await backend.fetchCurrentTargets(todayIso);
      if (targetResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      // Sum today's logged nutrition (roadmap 19 closed this seam) so Today shows real
      // calorie and protein progress against the target. Calories are integers and sum
      // exactly; protein is rounded to two decimals to avoid floating-point drift. An
      // empty day sums to zero intake, which still yields honest 0-of-target progress.
      const nutritionResult = await backend.fetchDayNutrition(
        `${todayIso}T00:00:00.000Z`,
        `${todayIso}T23:59:59.999Z`,
      );
      if (nutritionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const intake = sumDayIntake(nutritionResult.data ?? []);
      const nutrition = buildNutrition(
        targetResult.data ?? [],
        todayIso,
        intake,
      );

      return { data: { adherence, nutrition, session }, status: 'ready' };
    },

    async startSession(input: {
      scheduledSessionId: string;
      startedAtIso: string;
      userId: string;
    }): Promise<StartResult> {
      const { blocked, data, error } = await backend.startSession(input);
      if (blocked) {
        return { blocked: true, message: START_BLOCKED, success: false };
      }
      if (error || !data) {
        return { blocked: false, message: START_ERROR, success: false };
      }
      return { logId: data.id, success: true };
    },
  };
}

export type TodayRepository = ReturnType<typeof createTodayRepository>;
