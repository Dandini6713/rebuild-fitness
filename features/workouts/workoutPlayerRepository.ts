// Server boundary for the strength workout player (roadmap 11, S-012). Mirrors
// features/today and features/plan: a narrow backend interface keeps the
// composition logic testable, and a Supabase adapter implements it against the
// RLS-protected, owner-scoped tables. Every read and write only ever touches the
// caller's own rows because RLS enforces auth.uid() = user_id.
//
// This continues the workout_logs row that Today's "start session" created (roadmap
// 08); it does not open a second one. On load it resolves the in-progress log for
// today's scheduled session and only creates one if none exists (a robustness
// fallback for a deep link or a crash before Today wrote it).
//
// Local-first (docs/04 §4.4/§4.5): every completed set is written to the on-device
// store *first*, then synced to Supabase. Sync is idempotent on
// set_logs.client_operation_id, so a replay after backgrounding or reconnecting
// inserts nothing new — exactly one row, never a duplicate. The set is never lost
// if the network write fails; it stays queued locally and is replayed later.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type LoggedSet,
  type PlayerExercise,
  pickPreviousResult,
  type PreviousResult,
  type PriorSet,
} from '@/domain/training/workoutPlayer';
import type {
  ActiveWorkoutStore,
  PersistedSet,
} from '@/lib/persistence/activeWorkoutStore';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// --- Backend interface (flat rows; the adapter flattens Supabase's joins) -----

type RawSession = {
  id: string;
  session_type: string;
  template_id: string | null;
};
type RawLog = { id: string; started_at: string };
type RawTemplateExercise = {
  exerciseId: string;
  slug: string;
  name: string;
  order: number;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
};
type RawPriorSet = {
  exerciseId: string;
  weightKg: number | null;
  repetitions: number | null;
  completedAt: string;
};
type RawRecordedSet = {
  clientOperationId: string | null;
  exerciseId: string;
  exerciseOrder: number;
  setNumber: number;
  weightKg: number | null;
  repetitions: number | null;
  effortScore: number | null;
  discomfortScore: number | null;
  completedAt: string;
};

export type SetSyncRow = {
  exerciseLogId: string;
  setNumber: number;
  weightKg: number | null;
  repetitions: number | null;
  effortScore: number | null;
  discomfortScore: number | null;
  clientOperationId: string;
  completedAtIso: string;
  userId: string;
};

export type WorkoutPlayerBackend = {
  fetchScheduledSession(
    scheduledSessionId: string,
  ): Promise<{ data: RawSession | null; error: BackendError }>;
  findInProgressLog(
    scheduledSessionId: string,
  ): Promise<{ data: RawLog | null; error: BackendError }>;
  createLog(input: {
    scheduledSessionId: string;
    startedAtIso: string;
    userId: string;
  }): Promise<{ data: RawLog | null; error: BackendError }>;
  fetchTemplate(templateId: string): Promise<{
    data: { id: string; name: string } | null;
    error: BackendError;
  }>;
  fetchTemplateExercises(
    templateId: string,
  ): Promise<{ data: RawTemplateExercise[] | null; error: BackendError }>;
  fetchPreviousSets(input: {
    exerciseIds: string[];
    excludeWorkoutLogId: string;
  }): Promise<{ data: RawPriorSet[] | null; error: BackendError }>;
  fetchRecordedSets(
    workoutLogId: string,
  ): Promise<{ data: RawRecordedSet[] | null; error: BackendError }>;
  ensureExerciseLog(input: {
    workoutLogId: string;
    exerciseId: string;
    exerciseOrder: number;
    userId: string;
  }): Promise<{ data: { id: string } | null; error: BackendError }>;
  // Insert one set. A unique-constraint collision (client_operation_id, or
  // exercise_log_id+set_number) is reported as `duplicate` — a benign replay, not
  // an error — so callers treat it as already-synced.
  insertSet(
    row: SetSyncRow,
  ): Promise<{ duplicate: boolean; error: BackendError }>;
  completeLog(input: {
    workoutLogId: string;
    userId: string;
    sessionEffort: number | null;
    completedAtIso: string;
  }): Promise<{ error: BackendError }>;
};

// --- Read model ---------------------------------------------------------------

export type PlayerExerciseView = PlayerExercise & {
  previous: PreviousResult | null;
};

export type PlayerReadModel = {
  logId: string;
  startedAt: string;
  workoutName: string;
  exercises: PlayerExerciseView[];
  loggedSets: LoggedSet[];
};

export type LoadResult =
  | { status: 'ready'; model: PlayerReadModel }
  // The scheduled session is not a template-backed strength session; the strength
  // player does not apply (the cardio player is a later roadmap item).
  | { status: 'not-strength' }
  | { status: 'empty' }
  | { status: 'error'; message: string };

// logSet always succeeds locally (the set is durably saved before any network
// call). `synced` reports whether it also reached Supabase; a false value is not a
// failure — the set is queued and replayed later.
export type LogSetResult = { set: LoggedSet; synced: boolean };

export type CompleteResult =
  { success: true; syncedCount: number } | { success: false; message: string };

export type LogSetInput = {
  logId: string;
  exerciseId: string;
  exerciseOrder: number;
  setNumber: number;
  weightKg: number | null;
  repetitions: number | null;
  effortScore: number | null;
  discomfortScore: number | null;
  userId: string;
  clientOperationId: string;
  completedAtIso: string;
};

const READ_ERROR =
  'We could not load your session. Check your connection and try again.';
const OFFLINE_COMPLETE =
  'You appear to be offline. Your sets are saved on this device and the session will finish once you are back online.';

function toLoggedSet(set: PersistedSet): LoggedSet {
  return {
    discomfortScore: set.discomfortScore,
    effortScore: set.effortScore,
    exerciseId: set.exerciseId,
    repetitions: set.repetitions,
    setNumber: set.setNumber,
    weightKg: set.weightKg,
  };
}

export function createWorkoutPlayerRepository(deps: {
  backend: WorkoutPlayerBackend;
  store: ActiveWorkoutStore;
}) {
  const { backend, store } = deps;

  // Reconcile the on-device store with what Supabase already holds for this
  // workout, then return the local rows as the single source of truth. Any set
  // that reached Supabase (this device before a reinstall, or another device) but
  // is missing locally is copied in as already-synced, so a resumed session shows
  // every set and offline replay stays correct.
  async function hydrateLocalSets(
    logId: string,
    remote: RawRecordedSet[],
  ): Promise<LoggedSet[]> {
    const local = await store.loadSets(logId);
    const localByKey = new Set(local.map((set) => set.clientOperationId));
    for (const set of remote) {
      const operationId =
        set.clientOperationId ?? `remote:${set.exerciseId}:${set.setNumber}`;
      if (localByKey.has(operationId)) {
        continue;
      }
      await store.saveSet({
        clientOperationId: operationId,
        completedAt: set.completedAt,
        discomfortScore: set.discomfortScore,
        effortScore: set.effortScore,
        exerciseId: set.exerciseId,
        exerciseOrder: set.exerciseOrder,
        repetitions: set.repetitions,
        setNumber: set.setNumber,
        synced: true,
        weightKg: set.weightKg,
        workoutLogId: logId,
      });
    }
    const merged = await store.loadSets(logId);
    return merged.map(toLoggedSet);
  }

  // Push one locally-saved set to Supabase: rebuild its exercise_logs parent (or
  // reuse the cached id), then insert the set. A duplicate is treated as success.
  async function syncSet(
    set: PersistedSet,
    userId: string,
    exerciseLogIds: Map<string, string>,
  ): Promise<boolean> {
    let exerciseLogId = exerciseLogIds.get(set.exerciseId);
    if (!exerciseLogId) {
      const ensured = await backend.ensureExerciseLog({
        exerciseId: set.exerciseId,
        exerciseOrder: set.exerciseOrder,
        userId,
        workoutLogId: set.workoutLogId,
      });
      if (ensured.error || !ensured.data) {
        return false;
      }
      exerciseLogId = ensured.data.id;
      exerciseLogIds.set(set.exerciseId, exerciseLogId);
    }
    const inserted = await backend.insertSet({
      clientOperationId: set.clientOperationId,
      completedAtIso: set.completedAt,
      discomfortScore: set.discomfortScore,
      effortScore: set.effortScore,
      exerciseLogId,
      repetitions: set.repetitions,
      setNumber: set.setNumber,
      userId,
      weightKg: set.weightKg,
    });
    if (inserted.error) {
      return false;
    }
    // Success or a benign duplicate: the row exists in Supabase exactly once.
    await store.markSynced(set.clientOperationId);
    return true;
  }

  async function syncPending(logId: string, userId: string): Promise<number> {
    const pending = await store.listUnsynced(logId);
    const exerciseLogIds = new Map<string, string>();
    let synced = 0;
    for (const set of pending) {
      const ok = await syncSet(set, userId, exerciseLogIds);
      if (ok) {
        synced += 1;
      }
    }
    return synced;
  }

  return {
    async loadSession(input: {
      scheduledSessionId: string;
      userId: string;
      nowIso: string;
    }): Promise<LoadResult> {
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
      if (session.session_type !== 'strength' || !session.template_id) {
        return { status: 'not-strength' };
      }
      const templateId = session.template_id;

      const existing = await backend.findInProgressLog(
        input.scheduledSessionId,
      );
      if (existing.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      let log = existing.data;
      if (!log) {
        const created = await backend.createLog({
          scheduledSessionId: input.scheduledSessionId,
          startedAtIso: input.nowIso,
          userId: input.userId,
        });
        if (created.error || !created.data) {
          return { message: READ_ERROR, status: 'error' };
        }
        log = created.data;
      }
      const logId = log.id;

      const [templateResult, exercisesResult] = await Promise.all([
        backend.fetchTemplate(templateId),
        backend.fetchTemplateExercises(templateId),
      ]);
      if (templateResult.error || exercisesResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const rawExercises = [...(exercisesResult.data ?? [])].sort(
        (a, b) => a.order - b.order,
      );
      if (rawExercises.length === 0) {
        return { status: 'not-strength' };
      }

      const exerciseIds = rawExercises.map((exercise) => exercise.exerciseId);
      const priorResult = await backend.fetchPreviousSets({
        excludeWorkoutLogId: logId,
        exerciseIds,
      });
      if (priorResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const priorByExercise = new Map<string, PriorSet[]>();
      for (const prior of priorResult.data ?? []) {
        const list = priorByExercise.get(prior.exerciseId) ?? [];
        list.push({
          performedAt: prior.completedAt,
          repetitions: prior.repetitions,
          weightKg: prior.weightKg,
        });
        priorByExercise.set(prior.exerciseId, list);
      }

      const exercises: PlayerExerciseView[] = rawExercises.map((exercise) => ({
        exerciseId: exercise.exerciseId,
        name: exercise.name,
        order: exercise.order,
        previous: pickPreviousResult(
          priorByExercise.get(exercise.exerciseId) ?? [],
        ),
        repMax: exercise.repMax,
        repMin: exercise.repMin,
        restSeconds: exercise.restSeconds,
        slug: exercise.slug,
        targetSets: exercise.targetSets,
      }));

      const recordedResult = await backend.fetchRecordedSets(logId);
      if (recordedResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const loggedSets = await hydrateLocalSets(
        logId,
        recordedResult.data ?? [],
      );

      return {
        model: {
          exercises,
          loggedSets,
          logId,
          startedAt: log.started_at,
          workoutName: templateResult.data?.name ?? 'Strength session',
        },
        status: 'ready',
      };
    },

    async logSet(input: LogSetInput): Promise<LogSetResult> {
      const persisted: PersistedSet = {
        clientOperationId: input.clientOperationId,
        completedAt: input.completedAtIso,
        discomfortScore: input.discomfortScore,
        effortScore: input.effortScore,
        exerciseId: input.exerciseId,
        exerciseOrder: input.exerciseOrder,
        repetitions: input.repetitions,
        setNumber: input.setNumber,
        synced: false,
        weightKg: input.weightKg,
        workoutLogId: input.logId,
      };
      // Durable first: the set is safe on the device before any network call.
      await store.saveSet(persisted);
      // Then best-effort sync. A failure here does not lose the set.
      const synced = await syncSet(persisted, input.userId, new Map());
      return { set: toLoggedSet(persisted), synced };
    },

    // Replay any locally-queued sets to Supabase. Idempotent: already-synced sets
    // collide on their operation id and are counted as success without a new row.
    async syncPending(input: {
      logId: string;
      userId: string;
    }): Promise<number> {
      return syncPending(input.logId, input.userId);
    },

    async completeWorkout(input: {
      logId: string;
      userId: string;
      sessionEffort: number | null;
      completedAtIso: string;
    }): Promise<CompleteResult> {
      const syncedCount = await syncPending(input.logId, input.userId);
      const stillPending = await store.listUnsynced(input.logId);
      if (stillPending.length > 0) {
        // Sets remain unsynced (offline): keep the session live locally rather
        // than marking it complete against a session Supabase has not caught up on.
        return { message: OFFLINE_COMPLETE, success: false };
      }
      const { error } = await backend.completeLog({
        completedAtIso: input.completedAtIso,
        sessionEffort: input.sessionEffort,
        userId: input.userId,
        workoutLogId: input.logId,
      });
      if (error) {
        return { message: OFFLINE_COMPLETE, success: false };
      }
      await store.clearWorkout(input.logId);
      return { success: true, syncedCount };
    },
  };
}

export type WorkoutPlayerRepository = ReturnType<
  typeof createWorkoutPlayerRepository
>;

// --- Supabase adapter ---------------------------------------------------------

type NestedExerciseRow = {
  exercise_id: string;
  exercise_order: number;
  target_sets: number;
  rep_min: number | null;
  rep_max: number | null;
  rest_seconds: number | null;
  exercises: { slug: string; name: string } | null;
};

type NestedPriorRow = {
  weight_kg: number | null;
  repetitions: number | null;
  completed_at: string;
  exercise_logs: { exercise_id: string } | null;
};

export function createSupabaseWorkoutPlayerBackend(
  client: SupabaseClient<Database>,
): WorkoutPlayerBackend {
  return {
    async completeLog({ completedAtIso, sessionEffort, userId, workoutLogId }) {
      const { error } = await client
        .from('workout_logs')
        .update({
          completed_at: completedAtIso,
          session_effort: sessionEffort,
          status: 'completed',
        })
        .eq('id', workoutLogId)
        .eq('user_id', userId);
      return { error };
    },

    async createLog({ scheduledSessionId, startedAtIso, userId }) {
      const { data, error } = await client
        .from('workout_logs')
        .insert({
          scheduled_session_id: scheduledSessionId,
          started_at: startedAtIso,
          status: 'in_progress',
          user_id: userId,
        })
        .select('id, started_at')
        .single();
      return { data: data ?? null, error };
    },

    async ensureExerciseLog({
      exerciseId,
      exerciseOrder,
      userId,
      workoutLogId,
    }) {
      const existing = await client
        .from('exercise_logs')
        .select('id')
        .eq('workout_log_id', workoutLogId)
        .eq('exercise_id', exerciseId)
        .maybeSingle();
      if (existing.data) {
        return { data: { id: existing.data.id }, error: null };
      }
      if (existing.error) {
        return { data: null, error: existing.error };
      }
      const inserted = await client
        .from('exercise_logs')
        .insert({
          exercise_id: exerciseId,
          exercise_order: exerciseOrder,
          user_id: userId,
          workout_log_id: workoutLogId,
        })
        .select('id')
        .single();
      if (inserted.error) {
        // A concurrent insert may have won the unique (workout_log_id,
        // exercise_order) race; re-select so we return the surviving row.
        const retry = await client
          .from('exercise_logs')
          .select('id')
          .eq('workout_log_id', workoutLogId)
          .eq('exercise_id', exerciseId)
          .maybeSingle();
        if (retry.data) {
          return { data: { id: retry.data.id }, error: null };
        }
        return { data: null, error: inserted.error };
      }
      return { data: inserted.data ?? null, error: null };
    },

    async fetchPreviousSets({ excludeWorkoutLogId, exerciseIds }) {
      if (exerciseIds.length === 0) {
        return { data: [], error: null };
      }
      const { data, error } = await client
        .from('set_logs')
        .select(
          'weight_kg, repetitions, completed_at, exercise_logs!inner(exercise_id, workout_log_id)',
        )
        .in('exercise_logs.exercise_id', exerciseIds)
        .neq('exercise_logs.workout_log_id', excludeWorkoutLogId)
        .order('completed_at', { ascending: false });
      if (error) {
        return { data: null, error };
      }
      // The nested embed is a third-party shape; map it to the flat row we expose.
      const rows = (data ?? []) as unknown as NestedPriorRow[];
      return {
        data: rows
          .filter((row) => row.exercise_logs !== null)
          .map((row) => ({
            completedAt: row.completed_at,
            exerciseId: (row.exercise_logs as { exercise_id: string })
              .exercise_id,
            repetitions: row.repetitions,
            weightKg: row.weight_kg,
          })),
        error: null,
      };
    },

    async fetchRecordedSets(workoutLogId) {
      const logs = await client
        .from('exercise_logs')
        .select('id, exercise_id, exercise_order')
        .eq('workout_log_id', workoutLogId);
      if (logs.error) {
        return { data: null, error: logs.error };
      }
      const logRows = logs.data ?? [];
      if (logRows.length === 0) {
        return { data: [], error: null };
      }
      const byId = new Map(
        logRows.map((row) => [
          row.id,
          { exerciseId: row.exercise_id, exerciseOrder: row.exercise_order },
        ]),
      );
      const sets = await client
        .from('set_logs')
        .select(
          'exercise_log_id, set_number, weight_kg, repetitions, effort_score, discomfort_score, client_operation_id, completed_at',
        )
        .in(
          'exercise_log_id',
          logRows.map((row) => row.id),
        );
      if (sets.error) {
        return { data: null, error: sets.error };
      }
      return {
        data: (sets.data ?? []).map((row) => {
          const parent = byId.get(row.exercise_log_id);
          return {
            clientOperationId: row.client_operation_id,
            completedAt: row.completed_at,
            discomfortScore: row.discomfort_score,
            effortScore: row.effort_score,
            exerciseId: parent?.exerciseId ?? '',
            exerciseOrder: parent?.exerciseOrder ?? 1,
            repetitions: row.repetitions,
            setNumber: row.set_number,
            weightKg: row.weight_kg,
          };
        }),
        error: null,
      };
    },

    async fetchScheduledSession(scheduledSessionId) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select('id, session_type, template_id')
        .eq('id', scheduledSessionId)
        .maybeSingle();
      return { data: data ?? null, error };
    },

    async fetchTemplate(templateId) {
      const { data, error } = await client
        .from('workout_templates')
        .select('id, name')
        .eq('id', templateId)
        .maybeSingle();
      return { data: data ?? null, error };
    },

    async fetchTemplateExercises(templateId) {
      const { data, error } = await client
        .from('workout_template_exercises')
        .select(
          'exercise_id, exercise_order, target_sets, rep_min, rep_max, rest_seconds, exercises!inner(slug, name)',
        )
        .eq('template_id', templateId)
        .order('exercise_order', { ascending: true });
      if (error) {
        return { data: null, error };
      }
      const rows = (data ?? []) as unknown as NestedExerciseRow[];
      return {
        data: rows.map((row) => ({
          exerciseId: row.exercise_id,
          name: row.exercises?.name ?? 'Exercise',
          order: row.exercise_order,
          repMax: row.rep_max,
          repMin: row.rep_min,
          restSeconds: row.rest_seconds,
          slug: row.exercises?.slug ?? '',
          targetSets: row.target_sets,
        })),
        error: null,
      };
    },

    async findInProgressLog(scheduledSessionId) {
      const { data, error } = await client
        .from('workout_logs')
        .select('id, started_at')
        .eq('scheduled_session_id', scheduledSessionId)
        .eq('status', 'in_progress')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return { data: data ?? null, error };
    },

    async insertSet(row) {
      const { error } = await client.from('set_logs').insert({
        client_operation_id: row.clientOperationId,
        completed_at: row.completedAtIso,
        discomfort_score: row.discomfortScore,
        effort_score: row.effortScore,
        exercise_log_id: row.exerciseLogId,
        repetitions: row.repetitions,
        set_number: row.setNumber,
        user_id: row.userId,
        weight_kg: row.weightKg,
      });
      if (error) {
        // 23505 = unique violation: this exact set (by operation id, or by
        // exercise_log_id+set_number) is already stored. A benign replay.
        if (error.code === '23505') {
          return { duplicate: true, error: null };
        }
        return { duplicate: false, error };
      }
      return { duplicate: false, error: null };
    },
  };
}
