// Server boundary for the private training plan. Mirrors the onboarding
// repository: a narrow backend interface keeps the composition logic testable,
// and a Supabase adapter implements it against the RLS-protected owner-scoped
// tables.
//
// Server authority (docs/04 §4.2): seeding is a Postgres RPC that runs as the
// signed-in user, so it — not the client — decides what a plan contains and RLS
// (auth.uid() = user_id) enforces ownership. The read side only ever sees the
// caller's own rows for the same reason.

import type { SupabaseClient } from '@supabase/supabase-js';

import { enumerateWeekDates } from '@/domain/training/planSchedule';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

type SessionStatus = Database['public']['Enums']['session_status'];

export type SeedInput = { startDate: string; reset: boolean };

type RawPlan = { id: string; name: string; starts_on: string };
type RawWeek = { id: string; week_number: number; starts_on: string };
type RawSession = {
  id: string;
  plan_week_id: string | null;
  template_id: string | null;
  scheduled_date: string;
  session_type: string;
};
type RawTemplate = { id: string; name: string };

// The weekly planner needs a session's status (to know whether it is live,
// skipped, completed…) and its template's estimated duration, which the preview
// does not. Kept as separate rows/methods so the preview's types and tests are
// untouched.
type RawPlannerSession = {
  id: string;
  scheduled_date: string;
  session_type: string;
  status: SessionStatus;
  template_id: string | null;
};
type RawTemplateSummary = {
  id: string;
  name: string;
  estimated_minutes: number | null;
};

export type Ok<T> = { data: T; error: null };
export type Fail = { data: null; error: { message: string } };

export type PlanBackend = {
  seed(input: SeedInput): Promise<{ data: string | null; error: BackendError }>;
  fetchActivePlan(): Promise<{ data: RawPlan | null; error: BackendError }>;
  fetchWeeks(
    planId: string,
    limit: number,
  ): Promise<{ data: RawWeek[] | null; error: BackendError }>;
  fetchSessions(
    weekIds: string[],
  ): Promise<{ data: RawSession[] | null; error: BackendError }>;
  fetchTemplates(
    templateIds: string[],
  ): Promise<{ data: RawTemplate[] | null; error: BackendError }>;
  // Weekly planner reads and owner-scoped writes. Move, skip and replace are
  // plain RLS-protected updates on the user's own scheduled_sessions rows (like
  // starting a session in roadmap 08), never server-authority RPCs.
  fetchSessionsByDateRange(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawPlannerSession[] | null; error: BackendError }>;
  fetchTemplateSummaries(
    templateIds: string[],
  ): Promise<{ data: RawTemplateSummary[] | null; error: BackendError }>;
  updateSessionDate(input: {
    sessionId: string;
    toDate: string;
    userId: string;
  }): Promise<{ error: BackendError }>;
  skipScheduledSession(input: {
    sessionId: string;
    userId: string;
  }): Promise<{ error: BackendError }>;
  replaceScheduledSession(input: {
    sessionId: string;
    toType: string;
    toTemplateId: string | null;
    userId: string;
  }): Promise<{ error: BackendError }>;
};

export type PlanPreviewSession = {
  id: string;
  scheduledDate: string;
  sessionType: string;
  templateName: string | null;
};

export type PlanPreviewWeek = {
  weekNumber: number;
  startsOn: string;
  sessions: PlanPreviewSession[];
};

export type PlanPreview = {
  planId: string;
  name: string;
  startsOn: string;
  weeks: PlanPreviewWeek[];
};

export type SeedResult =
  { planId: string; success: true } | { message: string; success: false };

export type PreviewResult =
  | { status: 'ready'; preview: PlanPreview }
  | { status: 'empty' }
  | { status: 'error'; message: string };

// --- Weekly planner (S-020) read model -------------------------------------

export type PlannerSession = {
  id: string;
  scheduledDate: string;
  sessionType: string;
  status: SessionStatus;
  templateId: string | null;
  templateName: string | null;
  durationMinutes: number | null;
};

export type PlannerDay = {
  isoDate: string;
  // Usually one session, but a move can leave two on a day (which the scheduling
  // rules then flag), and days before the plan starts may hold none.
  sessions: PlannerSession[];
};

export type PlannerTemplate = { id: string; name: string };

export type PlannerWeek = {
  planName: string;
  weekStart: string;
  weekEnd: string;
  weekDates: string[];
  days: PlannerDay[];
  // The strength templates already in this week, offered as "replace with…"
  // options in the session detail sheet.
  templates: PlannerTemplate[];
};

export type WeekResult =
  | { status: 'ready'; week: PlannerWeek }
  | { status: 'empty' }
  | { status: 'error'; message: string };

export type MutationResult =
  { success: true } | { success: false; message: string };

export function createSupabasePlanBackend(
  client: SupabaseClient<Database>,
): PlanBackend {
  return {
    async seed({ reset, startDate }) {
      const { data, error } = await client.rpc('seed_private_plan', {
        p_reset: reset,
        p_start_date: startDate,
      });
      if (error) {
        return { data: null, error };
      }
      return { data: data ?? null, error: null };
    },

    async fetchActivePlan() {
      const { data, error } = await client
        .from('training_plans')
        .select('id, name, starts_on')
        .eq('status', 'active')
        .order('starts_on', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data: data ?? null, error };
    },

    async fetchWeeks(planId, limit) {
      const { data, error } = await client
        .from('plan_weeks')
        .select('id, week_number, starts_on')
        .eq('training_plan_id', planId)
        .order('week_number', { ascending: true })
        .limit(limit);
      return { data, error };
    },

    async fetchSessions(weekIds) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, plan_week_id, template_id, scheduled_date, session_type')
        .in('plan_week_id', weekIds)
        .order('scheduled_date', { ascending: true });
      return { data, error };
    },

    async fetchTemplates(templateIds) {
      const { data, error } = await client
        .from('workout_templates')
        .select('id, name')
        .in('id', templateIds);
      return { data, error };
    },

    async fetchSessionsByDateRange(startIso, endIso) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, scheduled_date, session_type, status, template_id')
        .gte('scheduled_date', startIso)
        .lte('scheduled_date', endIso)
        .order('scheduled_date', { ascending: true });
      return { data, error };
    },

    async fetchTemplateSummaries(templateIds) {
      const { data, error } = await client
        .from('workout_templates')
        .select('id, name, estimated_minutes')
        .in('id', templateIds);
      return { data, error };
    },

    async updateSessionDate({ sessionId, toDate, userId }) {
      // RLS confines the update to the caller's own rows; the explicit user_id
      // filter is defence in depth and mirrors the owner-scoped writes elsewhere.
      // source is marked 'user' so the audit trail (AGENTS.md) shows a manual move.
      const { error } = await client
        .from('scheduled_sessions')
        .update({ scheduled_date: toDate, source: 'user' })
        .eq('id', sessionId)
        .eq('user_id', userId);
      return { error };
    },

    async skipScheduledSession({ sessionId, userId }) {
      const { error } = await client
        .from('scheduled_sessions')
        .update({ status: 'skipped', source: 'user' })
        .eq('id', sessionId)
        .eq('user_id', userId);
      return { error };
    },

    async replaceScheduledSession({ sessionId, toType, toTemplateId, userId }) {
      const { error } = await client
        .from('scheduled_sessions')
        .update({
          session_type: toType,
          source: 'user',
          template_id: toTemplateId,
        })
        .eq('id', sessionId)
        .eq('user_id', userId);
      return { error };
    },
  };
}

const READ_ERROR =
  'We could not load your plan. Check your connection and try again.';
const SEED_ERROR =
  'We could not prepare your plan. Check your connection and try again.';
const WRITE_ERROR =
  'We could not save that change. Check your connection and try again.';

export function createPlanRepository(backend: PlanBackend) {
  return {
    async seedPrivatePlan(input: SeedInput): Promise<SeedResult> {
      const { data, error } = await backend.seed(input);
      if (error || !data) {
        return { message: SEED_ERROR, success: false };
      }
      return { planId: data, success: true };
    },

    async loadPreview(weeks: number): Promise<PreviewResult> {
      const plan = await backend.fetchActivePlan();
      if (plan.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      if (!plan.data) {
        return { status: 'empty' };
      }

      const weekResult = await backend.fetchWeeks(plan.data.id, weeks);
      if (weekResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const rawWeeks = [...(weekResult.data ?? [])].sort(
        (a, b) => a.week_number - b.week_number,
      );
      if (rawWeeks.length === 0) {
        return { status: 'empty' };
      }

      const weekIds = rawWeeks.map((week) => week.id);
      const sessionResult = await backend.fetchSessions(weekIds);
      if (sessionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const rawSessions = sessionResult.data ?? [];

      const templateIds = Array.from(
        new Set(
          rawSessions
            .map((session) => session.template_id)
            .filter((id): id is string => id !== null),
        ),
      );
      const templateNames = new Map<string, string>();
      if (templateIds.length > 0) {
        const templateResult = await backend.fetchTemplates(templateIds);
        if (templateResult.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        for (const template of templateResult.data ?? []) {
          templateNames.set(template.id, template.name);
        }
      }

      const previewWeeks: PlanPreviewWeek[] = rawWeeks.map((week) => ({
        sessions: rawSessions
          .filter((session) => session.plan_week_id === week.id)
          .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
          .map((session) => ({
            id: session.id,
            scheduledDate: session.scheduled_date,
            sessionType: session.session_type,
            templateName: session.template_id
              ? (templateNames.get(session.template_id) ?? null)
              : null,
          })),
        startsOn: week.starts_on,
        weekNumber: week.week_number,
      }));

      return {
        preview: {
          name: plan.data.name,
          planId: plan.data.id,
          startsOn: plan.data.starts_on,
          weeks: previewWeeks,
        },
        status: 'ready',
      };
    },

    // Loads one seven-day window for the weekly planner: the active plan (to tell
    // "no plan yet" apart from "an ordinary quiet week"), the sessions in the
    // window with their status, and the template names and durations they need.
    async loadWeek(range: { start: string; end: string }): Promise<WeekResult> {
      const plan = await backend.fetchActivePlan();
      if (plan.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      if (!plan.data) {
        return { status: 'empty' };
      }

      const sessionResult = await backend.fetchSessionsByDateRange(
        range.start,
        range.end,
      );
      if (sessionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const rawSessions = sessionResult.data ?? [];

      const templateIds = Array.from(
        new Set(
          rawSessions
            .map((session) => session.template_id)
            .filter((id): id is string => id !== null),
        ),
      );
      const templateNames = new Map<string, string>();
      const templateMinutes = new Map<string, number | null>();
      if (templateIds.length > 0) {
        const templateResult =
          await backend.fetchTemplateSummaries(templateIds);
        if (templateResult.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        for (const template of templateResult.data ?? []) {
          templateNames.set(template.id, template.name);
          templateMinutes.set(template.id, template.estimated_minutes);
        }
      }

      const toSession = (raw: RawPlannerSession): PlannerSession => ({
        durationMinutes: raw.template_id
          ? (templateMinutes.get(raw.template_id) ?? null)
          : null,
        id: raw.id,
        scheduledDate: raw.scheduled_date,
        sessionType: raw.session_type,
        status: raw.status,
        templateId: raw.template_id,
        templateName: raw.template_id
          ? (templateNames.get(raw.template_id) ?? null)
          : null,
      });

      const weekDates = enumerateWeekDates(range.start);
      const days: PlannerDay[] = weekDates.map((isoDate) => ({
        isoDate,
        sessions: rawSessions
          .filter((session) => session.scheduled_date === isoDate)
          .map(toSession),
      }));

      const templates: PlannerTemplate[] = Array.from(templateNames.entries())
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));

      return {
        status: 'ready',
        week: {
          days,
          planName: plan.data.name,
          templates,
          weekDates,
          weekEnd: range.end,
          weekStart: range.start,
        },
      };
    },

    async moveSession(input: {
      sessionId: string;
      toDate: string;
      userId: string;
    }): Promise<MutationResult> {
      const { error } = await backend.updateSessionDate(input);
      return error
        ? { message: WRITE_ERROR, success: false }
        : { success: true };
    },

    async skipSession(input: {
      sessionId: string;
      userId: string;
    }): Promise<MutationResult> {
      const { error } = await backend.skipScheduledSession(input);
      return error
        ? { message: WRITE_ERROR, success: false }
        : { success: true };
    },

    async replaceSession(input: {
      sessionId: string;
      toType: string;
      toTemplateId: string | null;
      userId: string;
    }): Promise<MutationResult> {
      const { error } = await backend.replaceScheduledSession(input);
      return error
        ? { message: WRITE_ERROR, success: false }
        : { success: true };
    },
  };
}

export type PlanRepository = ReturnType<typeof createPlanRepository>;
