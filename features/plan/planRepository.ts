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

import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

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
  };
}

const READ_ERROR =
  'We could not load your plan. Check your connection and try again.';
const SEED_ERROR =
  'We could not prepare your plan. Check your connection and try again.';

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
  };
}

export type PlanRepository = ReturnType<typeof createPlanRepository>;
