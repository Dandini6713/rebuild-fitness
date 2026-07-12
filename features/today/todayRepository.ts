// Server boundary for the Today screen. Mirrors features/plan/planRepository.ts:
// a narrow backend interface keeps the composition logic testable, and a Supabase
// adapter implements it against the RLS-protected, owner-scoped tables. Every read
// only ever sees the caller's own rows because RLS enforces auth.uid() = user_id.
//
// Starting a session (docs/03 S-010 primary action) is a plain owner-scoped insert
// into workout_logs, not one of the server-authority actions in docs/04 §4.2
// (plan progression, calorie changes, AI actions), so it is safe to write from the
// client under RLS. The guided workout player (S-012) is a later roadmap item; this
// step only records that the session has begun. See useToday and CLAUDE.md.

import type { SupabaseClient } from '@supabase/supabase-js';

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

export type TodayBackend = {
  fetchCurrentTargets(
    todayIso: string,
  ): Promise<{ data: RawTarget[] | null; error: BackendError }>;
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
  }): Promise<{ data: { id: string } | null; error: BackendError }>;
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
  { logId: string; success: true } | { message: string; success: false };

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

    async startSession({ scheduledSessionId, startedAtIso, userId }) {
      const { data, error } = await client
        .from('workout_logs')
        .insert({
          scheduled_session_id: scheduledSessionId,
          started_at: startedAtIso,
          status: 'in_progress',
          user_id: userId,
        })
        .select('id')
        .single();
      return { data: data ?? null, error };
    },
  };
}

const READ_ERROR =
  'We could not load today. Check your connection and try again.';
const START_ERROR =
  'We could not start your session. Check your connection and try again.';

// Builds the nutrition section from the effective-dated targets. Intake is not yet
// sourced anywhere, so progress is left null and the view shows the target alone
// rather than a fabricated zero. The progress fields are wired for the food-logging
// roadmap item, which will supply a real intake.
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

      const todaysRaw =
        weekSessions.find((session) => session.scheduled_date === todayIso) ??
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
        weekSessions.map((sessionRow) => ({
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
      // No intake source yet (nutrition_logs are not written until a later step),
      // so intake is null and the target renders on its own.
      const nutrition = buildNutrition(targetResult.data ?? [], todayIso, null);

      return { data: { adherence, nutrition, session }, status: 'ready' };
    },

    async startSession(input: {
      scheduledSessionId: string;
      startedAtIso: string;
      userId: string;
    }): Promise<StartResult> {
      const { data, error } = await backend.startSession(input);
      if (error || !data) {
        return { message: START_ERROR, success: false };
      }
      return { logId: data.id, success: true };
    },
  };
}

export type TodayRepository = ReturnType<typeof createTodayRepository>;
