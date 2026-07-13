// Server boundary for the cardio interval player (roadmap 16, S-014). Mirrors
// features/workouts: a narrow backend interface keeps the composition testable, and
// a Supabase adapter implements it against the RLS-protected, owner-scoped cardio
// tables. Every read and write only ever touches the caller's own rows because RLS
// enforces auth.uid() = user_id.
//
// Unlike the strength player, starting a cardio session needs no trusted RPC: a
// cardio day is never gated by the red-readiness block (only running and demanding
// lower-body are), so this is a plain owner-scoped insert into cardio_logs under
// RLS. The player continues an in-progress cardio_log if one exists (a resume),
// otherwise creates one.
//
// Local-first (docs/04 §4.4/§4.5): the minimal resume state (which log, the clock,
// paused-or-not) is written to the on-device store so a background, lock or crash
// can resume mid-interval. There is no per-segment sync — the durable record is for
// RESUME, and the cardio_logs summary written on completion is the synced record.
//
// Which stage is played: the base plan does not link a scheduled cardio session to
// a stage (the roadmap 09 / 15 seam — every cardio day is one 'cardio' type), and
// choosing the stage is the running-progression engine (roadmap 17). Until then the
// player plays the caller's lowest available stage; a resumed session keeps whatever
// stage its log already recorded.

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  CardioClock,
  IntervalStep,
} from '@/domain/training/cardioIntervalPlayer';
import { startClock } from '@/domain/training/cardioIntervalPlayer';
import type { ActiveCardioStore } from '@/lib/persistence/activeCardioStore';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// The scheduled cardio session types the player drives. The base plan types every
// low-impact cardio day as 'cardio'; walk/bike/cross_trainer arrive when distinct
// activity typing lands (roadmap 17) and are accepted here already so the player
// need not change then.
const CARDIO_SESSION_TYPES = new Set([
  'cardio',
  'walk',
  'bike',
  'cross_trainer',
]);

// --- Backend interface (flat rows; the adapter flattens Supabase's shapes) -----

type RawSession = { id: string; session_type: string };
type RawTemplate = {
  id: string;
  name: string;
  sessionType: string;
  stageNumber: number | null;
  estimatedMinutes: number | null;
};
type RawStep = {
  order: number;
  activityType: string;
  durationSeconds: number;
  cueText: string | null;
};
type RawCardioLog = {
  id: string;
  startedAt: string;
  cardioTemplateId: string | null;
};

export type CardioPlayerBackend = {
  fetchScheduledSession(
    scheduledSessionId: string,
  ): Promise<{ data: RawSession | null; error: BackendError }>;
  // The caller's lowest-stage cardio template (roadmap 16 plays this by default),
  // or a specific one by id when resuming a log that recorded its template.
  fetchDefaultTemplate(): Promise<{
    data: RawTemplate | null;
    error: BackendError;
  }>;
  fetchTemplate(
    templateId: string,
  ): Promise<{ data: RawTemplate | null; error: BackendError }>;
  fetchTemplateSteps(
    templateId: string,
  ): Promise<{ data: RawStep[] | null; error: BackendError }>;
  findInProgressLog(
    scheduledSessionId: string,
  ): Promise<{ data: RawCardioLog | null; error: BackendError }>;
  createLog(input: {
    scheduledSessionId: string;
    cardioTemplateId: string | null;
    startedAtIso: string;
    userId: string;
  }): Promise<{ data: RawCardioLog | null; error: BackendError }>;
  completeLog(input: {
    cardioLogId: string;
    userId: string;
    completedAtIso: string;
    durationSeconds: number;
    sessionEffort: number | null;
  }): Promise<{ error: BackendError }>;
  updateScheduledSessionStatus(input: {
    scheduledSessionId: string;
    userId: string;
    status: 'completed';
  }): Promise<{ error: BackendError }>;
};

// --- Read model ---------------------------------------------------------------

export type CardioReadModel = {
  cardioLogId: string;
  scheduledSessionId: string;
  cardioTemplateId: string | null;
  templateName: string;
  activityKind: string;
  stageNumber: number | null;
  estimatedMinutes: number | null;
  startedAt: string;
  steps: IntervalStep[];
  // The resume clock: fresh from started_at, or restored from local state.
  clock: CardioClock;
  // True when this is a brand-new session (no prior local state), so the hook plays
  // the opening cue; false on a resume, so the hook seeds its cue cursor to the
  // current elapsed and never replays cues that already fired before the resume.
  startedFresh: boolean;
};

export type CardioLoadResult =
  | { status: 'ready'; model: CardioReadModel }
  // The scheduled session is not a cardio session; the cardio player does not apply.
  | { status: 'not-cardio' }
  // No scheduled session was found.
  | { status: 'empty' }
  // A cardio session, but the user has no cardio programme seeded to play yet.
  | { status: 'no-programme' }
  | { status: 'error'; message: string };

export type CardioCompleteResult =
  { success: true } | { success: false; message: string };

const READ_ERROR =
  'We could not load your cardio session. Check your connection and try again.';
const OFFLINE_COMPLETE =
  'You appear to be offline. Your session is saved on this device and will finish once you are back online.';

// Rebuild the clock from stored resume state (pause-aware) or start a fresh one.
function clockFromState(
  state: {
    startedAtMs: number;
    pausedAccumMs: number;
    pausedAtMs: number | null;
  } | null,
  startedAtIso: string,
): CardioClock {
  if (state) {
    return {
      pausedAccumMs: state.pausedAccumMs,
      pausedAtMs: state.pausedAtMs,
      startedAtMs: state.startedAtMs,
    };
  }
  const startedMs = Date.parse(startedAtIso);
  return startClock(Number.isNaN(startedMs) ? 0 : startedMs);
}

export function createCardioPlayerRepository(deps: {
  backend: CardioPlayerBackend;
  store: ActiveCardioStore;
}) {
  const { backend, store } = deps;

  return {
    async loadSession(input: {
      scheduledSessionId: string;
      userId: string;
      nowIso: string;
    }): Promise<CardioLoadResult> {
      const sessionResult = await backend.fetchScheduledSession(
        input.scheduledSessionId,
      );
      if (sessionResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const session = sessionResult.data;
      if (!session) {
        return { status: 'empty' };
      }
      if (!CARDIO_SESSION_TYPES.has(session.session_type)) {
        return { status: 'not-cardio' };
      }

      // Resume an in-progress log if one exists; otherwise create one now.
      const existing = await backend.findInProgressLog(
        input.scheduledSessionId,
      );
      if (existing.error) {
        return { message: READ_ERROR, status: 'error' };
      }

      // Resolve the template: a resumed log keeps its recorded template; a fresh
      // session plays the lowest available stage.
      let template: RawTemplate | null = null;
      if (existing.data?.cardioTemplateId) {
        const fetched = await backend.fetchTemplate(
          existing.data.cardioTemplateId,
        );
        if (fetched.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        template = fetched.data;
      }
      if (!template) {
        const fallback = await backend.fetchDefaultTemplate();
        if (fallback.error) {
          return { message: READ_ERROR, status: 'error' };
        }
        template = fallback.data;
      }
      if (!template) {
        // A cardio session but no stage library seeded yet — nothing to play.
        return { status: 'no-programme' };
      }

      let log = existing.data;
      if (!log) {
        const created = await backend.createLog({
          cardioTemplateId: template.id,
          scheduledSessionId: input.scheduledSessionId,
          startedAtIso: input.nowIso,
          userId: input.userId,
        });
        if (created.error || !created.data) {
          return { message: READ_ERROR, status: 'error' };
        }
        log = created.data;
      }
      const cardioLogId = log.id;

      const stepsResult = await backend.fetchTemplateSteps(template.id);
      if (stepsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const steps = [...(stepsResult.data ?? [])].sort(
        (a, b) => a.order - b.order,
      );
      if (steps.length === 0) {
        return { status: 'no-programme' };
      }

      // Restore (or initialise) the local resume state. A first load with no stored
      // state writes one, so a subsequent background/lock can resume even before the
      // user has paused.
      const stored = await store.loadState(cardioLogId);
      const activeStored = stored && stored.status === 'active' ? stored : null;
      const clock = clockFromState(activeStored, log.startedAt ?? input.nowIso);
      if (!activeStored) {
        await store.saveState({
          cardioLogId,
          cardioTemplateId: template.id,
          pausedAccumMs: clock.pausedAccumMs,
          pausedAtMs: clock.pausedAtMs,
          scheduledSessionId: input.scheduledSessionId,
          startedAtMs: clock.startedAtMs,
          status: 'active',
          updatedAtMs: clock.startedAtMs,
        });
      }

      return {
        model: {
          activityKind: template.sessionType,
          cardioLogId,
          cardioTemplateId: template.id,
          clock,
          estimatedMinutes: template.estimatedMinutes,
          scheduledSessionId: input.scheduledSessionId,
          stageNumber: template.stageNumber,
          startedAt: log.startedAt,
          startedFresh: activeStored === null,
          steps,
          templateName: template.name,
        },
        status: 'ready',
      };
    },

    // Persist the resume state after a pause, resume or periodic checkpoint. Durable
    // and local-only; there is no server sync for interval position.
    async saveClock(input: {
      cardioLogId: string;
      scheduledSessionId: string;
      cardioTemplateId: string | null;
      clock: CardioClock;
      nowMs: number;
    }): Promise<void> {
      await store.saveState({
        cardioLogId: input.cardioLogId,
        cardioTemplateId: input.cardioTemplateId,
        pausedAccumMs: input.clock.pausedAccumMs,
        pausedAtMs: input.clock.pausedAtMs,
        scheduledSessionId: input.scheduledSessionId,
        startedAtMs: input.clock.startedAtMs,
        status: 'active',
        updatedAtMs: input.nowMs,
      });
    },

    // Finish the session: write the cardio_logs summary and close the scheduled
    // session, then drop the local resume state. Offline, the write fails honestly
    // and the local state is kept so completion can be retried — never a pretend swap.
    async completeSession(input: {
      cardioLogId: string;
      scheduledSessionId: string;
      userId: string;
      completedAtIso: string;
      durationSeconds: number;
      sessionEffort: number | null;
    }): Promise<CardioCompleteResult> {
      const { error } = await backend.completeLog({
        cardioLogId: input.cardioLogId,
        completedAtIso: input.completedAtIso,
        durationSeconds: input.durationSeconds,
        sessionEffort: input.sessionEffort,
        userId: input.userId,
      });
      if (error) {
        return { message: OFFLINE_COMPLETE, success: false };
      }

      // Close the originating scheduled session so the weekly planner no longer
      // shows a finished cardio session as planned. Best-effort: a failure here must
      // not fail an already-completed session.
      const closed = await backend.updateScheduledSessionStatus({
        scheduledSessionId: input.scheduledSessionId,
        status: 'completed',
        userId: input.userId,
      });
      if (closed.error) {
        logNonBlocking('closing the scheduled session', closed.error);
      }

      await store.clearState(input.cardioLogId);
      return { success: true };
    },
  };
}

function logNonBlocking(context: string, error: unknown): void {
  if (typeof __DEV__ !== 'undefined' && __DEV__) {
    console.warn(`[cardio] ${context} failed (non-blocking):`, error);
  }
}

export type CardioPlayerRepository = ReturnType<
  typeof createCardioPlayerRepository
>;

// --- Supabase adapter ---------------------------------------------------------

type NestedTemplateRow = {
  id: string;
  name: string;
  session_type: string;
  stage_number: number | null;
  estimated_minutes: number | null;
};

export function createSupabaseCardioPlayerBackend(
  client: SupabaseClient<Database>,
): CardioPlayerBackend {
  function toTemplate(row: NestedTemplateRow): RawTemplate {
    return {
      estimatedMinutes: row.estimated_minutes,
      id: row.id,
      name: row.name,
      sessionType: row.session_type,
      stageNumber: row.stage_number,
    };
  }

  return {
    async completeLog({
      cardioLogId,
      completedAtIso,
      durationSeconds,
      sessionEffort,
      userId,
    }) {
      const { error } = await client
        .from('cardio_logs')
        .update({
          completed_at: completedAtIso,
          duration_seconds: durationSeconds,
          session_effort: sessionEffort,
          status: 'completed',
        })
        .eq('id', cardioLogId)
        .eq('user_id', userId);
      return { error };
    },

    async createLog({
      cardioTemplateId,
      scheduledSessionId,
      startedAtIso,
      userId,
    }) {
      const { data, error } = await client
        .from('cardio_logs')
        .insert({
          cardio_template_id: cardioTemplateId,
          scheduled_session_id: scheduledSessionId,
          started_at: startedAtIso,
          status: 'in_progress',
          user_id: userId,
        })
        .select('id, started_at, cardio_template_id')
        .single();
      if (error || !data) {
        return { data: null, error };
      }
      return {
        data: {
          cardioTemplateId: data.cardio_template_id,
          id: data.id,
          startedAt: data.started_at,
        },
        error: null,
      };
    },

    async fetchDefaultTemplate() {
      const { data, error } = await client
        .from('cardio_templates')
        .select('id, name, session_type, stage_number, estimated_minutes')
        .not('stage_number', 'is', null)
        .order('stage_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) {
        return { data: null, error };
      }
      return { data: data ? toTemplate(data) : null, error: null };
    },

    async fetchScheduledSession(scheduledSessionId) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, session_type')
        .eq('id', scheduledSessionId)
        .maybeSingle();
      return { data: data ?? null, error };
    },

    async fetchTemplate(templateId) {
      const { data, error } = await client
        .from('cardio_templates')
        .select('id, name, session_type, stage_number, estimated_minutes')
        .eq('id', templateId)
        .maybeSingle();
      if (error) {
        return { data: null, error };
      }
      return { data: data ? toTemplate(data) : null, error: null };
    },

    async fetchTemplateSteps(templateId) {
      const { data, error } = await client
        .from('cardio_interval_steps')
        .select('step_order, activity_type, duration_seconds, cue_text')
        .eq('cardio_template_id', templateId)
        .order('step_order', { ascending: true });
      if (error) {
        return { data: null, error };
      }
      return {
        data: (data ?? []).map((row) => ({
          activityType: row.activity_type,
          cueText: row.cue_text,
          durationSeconds: row.duration_seconds,
          order: row.step_order,
        })),
        error: null,
      };
    },

    async findInProgressLog(scheduledSessionId) {
      const { data, error } = await client
        .from('cardio_logs')
        .select('id, started_at, cardio_template_id')
        .eq('scheduled_session_id', scheduledSessionId)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        return { data: null, error };
      }
      return {
        data: data
          ? {
              cardioTemplateId: data.cardio_template_id,
              id: data.id,
              startedAt: data.started_at,
            }
          : null,
        error: null,
      };
    },

    async updateScheduledSessionStatus({ scheduledSessionId, status, userId }) {
      const { error } = await client
        .from('scheduled_sessions')
        .update({ status })
        .eq('id', scheduledSessionId)
        .eq('user_id', userId);
      return { error };
    },
  };
}
