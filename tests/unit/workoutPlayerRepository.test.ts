import { describe, expect, it } from '@jest/globals';

import {
  createWorkoutPlayerRepository,
  type ProgressionProposalRow,
  type WorkoutPlayerBackend,
} from '@/features/workouts/workoutPlayerRepository';
import { createMemoryWorkoutStore } from '@/lib/persistence/activeWorkoutStore';

// A stand-in for the Supabase backend that enforces the two set_logs uniqueness
// guarantees (client_operation_id, and exercise_log_id + set_number) exactly as the
// database would, and can be switched offline to simulate a dropped connection. It
// lets these tests prove the local-first and no-duplicate behaviour without a
// database.
function createFake(
  options: {
    online?: boolean;
    sessionType?: string;
    templateId?: string | null;
    inProgressLogId?: string | null;
    // Completed exposures returned to the progression evaluator on completion.
    exposures?: {
      exerciseId: string;
      workoutLogId: string;
      exposureAt: string;
      weightKg: number | null;
      repetitions: number | null;
      effortScore: number | null;
      discomfortScore: number | null;
      techniqueControlled: boolean | null;
    }[];
    failProposalInsert?: boolean;
    latestProposals?: {
      id: string;
      templateExerciseId: string;
      decision: 'increase' | 'hold' | 'reduce_or_substitute';
      proposedWeightKg: number | null;
      currentWeightKg: number | null;
      reasons: { code: string; message: string }[];
    }[];
  } = {},
) {
  const state = {
    completed: false,
    createdLogs: 0,
    decided: [] as { proposalId: string; status: string }[],
    exerciseLogSeq: 0,
    exerciseLogs: new Map<string, string>(),
    online: options.online ?? true,
    proposals: [] as ProgressionProposalRow[],
    scheduledSessionStatus: null as string | null,
    sets: [] as {
      clientOperationId: string;
      exerciseLogId: string;
      setNumber: number;
    }[],
  };

  const backend: WorkoutPlayerBackend = {
    async completeLog() {
      if (!state.online) {
        return { error: { message: 'offline' } };
      }
      state.completed = true;
      return { error: null };
    },
    async createLog() {
      state.createdLogs += 1;
      return {
        data: { id: 'wl-created', started_at: '2026-07-12T10:00:00.000Z' },
        error: null,
      };
    },
    async ensureExerciseLog({ exerciseId, workoutLogId }) {
      if (!state.online) {
        return { data: null, error: { message: 'offline' } };
      }
      const key = `${workoutLogId}|${exerciseId}`;
      let id = state.exerciseLogs.get(key);
      if (!id) {
        state.exerciseLogSeq += 1;
        id = `el-${state.exerciseLogSeq}`;
        state.exerciseLogs.set(key, id);
      }
      return { data: { id }, error: null };
    },
    async fetchPreviousSets() {
      return {
        data: [
          {
            completedAt: '2026-07-05T10:00:00.000Z',
            exerciseId: 'ex-1',
            repetitions: 10,
            weightKg: 22.5,
          },
        ],
        error: null,
      };
    },
    async fetchRecordedSets() {
      return { data: [], error: null };
    },
    async fetchScheduledSession(id) {
      return {
        data: {
          id,
          session_type: options.sessionType ?? 'strength',
          template_id:
            options.templateId === undefined ? 'tmpl-1' : options.templateId,
        },
        error: null,
      };
    },
    async fetchTemplate() {
      return { data: { id: 'tmpl-1', name: 'Strength A' }, error: null };
    },
    async fetchTemplateExercises() {
      return {
        data: [
          {
            exerciseId: 'ex-1',
            name: 'Leg press',
            order: 1,
            repMax: 12,
            repMin: 8,
            restSeconds: 90,
            singleExposureProgression: false,
            slug: 'leg-press',
            targetSets: 2,
            templateExerciseId: 'te-1',
            weightIncrementKg: 2.5,
          },
        ],
        error: null,
      };
    },
    async fetchCompletedExposures() {
      return { data: options.exposures ?? [], error: null };
    },
    async insertProgressionProposal(row) {
      if (options.failProposalInsert) {
        return { error: { message: 'insert failed' } };
      }
      state.proposals.push(row);
      return { error: null };
    },
    async fetchLatestProposals() {
      return { data: options.latestProposals ?? [], error: null };
    },
    async decideProposal({ proposalId, status }) {
      state.decided.push({ proposalId, status });
      return { error: null };
    },
    async updateScheduledSessionStatus({ status }) {
      state.scheduledSessionStatus = status;
      return { error: null };
    },
    async findInProgressLog() {
      const id =
        options.inProgressLogId === undefined
          ? 'wl-1'
          : options.inProgressLogId;
      return {
        data: id ? { id, started_at: '2026-07-12T10:00:00.000Z' } : null,
        error: null,
      };
    },
    async insertSet(row) {
      if (!state.online) {
        return { duplicate: false, error: { message: 'offline' } };
      }
      const opClash = state.sets.some(
        (set) => set.clientOperationId === row.clientOperationId,
      );
      const numberClash = state.sets.some(
        (set) =>
          set.exerciseLogId === row.exerciseLogId &&
          set.setNumber === row.setNumber,
      );
      if (opClash || numberClash) {
        return { duplicate: true, error: null };
      }
      state.sets.push({
        clientOperationId: row.clientOperationId,
        exerciseLogId: row.exerciseLogId,
        setNumber: row.setNumber,
      });
      return { duplicate: false, error: null };
    },
  };

  return { backend, state };
}

const logSetInput = (overrides: Record<string, unknown> = {}) => ({
  clientOperationId: 'op-1',
  completedAtIso: '2026-07-12T10:01:00.000Z',
  discomfortScore: 0,
  effortScore: 7,
  exerciseId: 'ex-1',
  exerciseOrder: 1,
  logId: 'wl-1',
  repetitions: 10,
  setNumber: 1,
  techniqueControlled: true,
  userId: 'user-1',
  weightKg: 20,
  ...overrides,
});

const completeInput = (overrides: Record<string, unknown> = {}) => ({
  completedAtIso: '2026-07-12T10:30:00.000Z',
  logId: 'wl-1',
  scheduledSessionId: 'sess-1',
  sessionEffort: null,
  templateId: 'tmpl-1',
  userId: 'user-1',
  ...overrides,
});

describe('workout player repository — local-first logging', () => {
  it('persists a set locally even when the network write fails, so it is never lost', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: false });
    const repo = createWorkoutPlayerRepository({ backend, store });

    const result = await repo.logSet(logSetInput());

    // The caller is told the set is saved but not yet synced — not a failure.
    expect(result.synced).toBe(false);
    // Nothing reached the "server"...
    expect(state.sets).toHaveLength(0);
    // ...but the set is durably on the device, flagged for later sync.
    const local = await store.loadSets('wl-1');
    expect(local).toHaveLength(1);
    expect(local[0]?.synced).toBe(false);
    expect(local[0]?.weightKg).toBe(20);
  });

  it('writes through to the server when online and marks the set synced', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: true });
    const repo = createWorkoutPlayerRepository({ backend, store });

    const result = await repo.logSet(logSetInput());

    expect(result.synced).toBe(true);
    expect(state.sets).toHaveLength(1);
    expect(await store.listUnsynced('wl-1')).toHaveLength(0);
  });
});

describe('workout player repository — no duplicate sets on replay', () => {
  it('logging the exact same set twice results in exactly one server row', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: true });
    const repo = createWorkoutPlayerRepository({ backend, store });

    await repo.logSet(logSetInput({ clientOperationId: 'op-9' }));
    // The background/reconnect path replays the identical operation.
    await repo.logSet(logSetInput({ clientOperationId: 'op-9' }));

    expect(state.sets).toHaveLength(1);
  });

  it('a queued set synced after reconnect, then replayed, still yields one row', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: false });
    const repo = createWorkoutPlayerRepository({ backend, store });

    // Logged while offline: saved locally, not on the server.
    await repo.logSet(logSetInput({ clientOperationId: 'op-3' }));
    expect(state.sets).toHaveLength(0);

    // Reconnect and flush.
    state.online = true;
    const syncedCount = await repo.syncPending({
      logId: 'wl-1',
      userId: 'user-1',
    });
    expect(syncedCount).toBe(1);
    expect(state.sets).toHaveLength(1);

    // Simulate a replay where the set is re-queued (e.g. the app was killed
    // before it recorded the successful sync). Syncing again must not duplicate.
    await store.saveSet({
      clientOperationId: 'op-3',
      completedAt: '2026-07-12T10:01:00.000Z',
      discomfortScore: 0,
      effortScore: 7,
      exerciseId: 'ex-1',
      exerciseOrder: 1,
      repetitions: 10,
      setNumber: 1,
      synced: false,
      techniqueControlled: true,
      weightKg: 20,
      workoutLogId: 'wl-1',
    });
    await repo.syncPending({ logId: 'wl-1', userId: 'user-1' });

    expect(state.sets).toHaveLength(1);
  });
});

describe('workout player repository — loading a session', () => {
  it('continues the in-progress log without creating a second one', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ inProgressLogId: 'wl-1' });
    const repo = createWorkoutPlayerRepository({ backend, store });

    const result = await repo.loadSession({
      nowIso: '2026-07-12T10:00:00.000Z',
      scheduledSessionId: 'sess-1',
      userId: 'user-1',
    });

    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.model.logId).toBe('wl-1');
    expect(state.createdLogs).toBe(0);
    // Previous result is surfaced from earlier sessions' sets.
    expect(result.model.exercises[0]?.previous).toEqual({
      performedAt: '2026-07-05T10:00:00.000Z',
      repetitions: 10,
      weightKg: 22.5,
    });
  });

  it('creates the log only when none is in progress', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ inProgressLogId: null });
    const repo = createWorkoutPlayerRepository({ backend, store });

    const result = await repo.loadSession({
      nowIso: '2026-07-12T10:00:00.000Z',
      scheduledSessionId: 'sess-1',
      userId: 'user-1',
    });

    expect(state.createdLogs).toBe(1);
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.model.logId).toBe('wl-created');
  });

  it('reports a non-strength session rather than opening the strength player', async () => {
    const store = createMemoryWorkoutStore();
    const { backend } = createFake({ sessionType: 'cardio', templateId: null });
    const repo = createWorkoutPlayerRepository({ backend, store });

    const result = await repo.loadSession({
      nowIso: '2026-07-12T10:00:00.000Z',
      scheduledSessionId: 'sess-1',
      userId: 'user-1',
    });

    expect(result.status).toBe('not-strength');
  });
});

describe('workout player repository — completing', () => {
  it('flushes then completes when online', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: true });
    const repo = createWorkoutPlayerRepository({ backend, store });
    await repo.logSet(logSetInput({ clientOperationId: 'op-1' }));

    const result = await repo.completeWorkout(completeInput());

    expect(result.success).toBe(true);
    expect(state.completed).toBe(true);
    // Local rows are cleared once safely synced and completed.
    expect(await store.loadSets('wl-1')).toEqual([]);
  });

  it('refuses to complete while sets are still unsynced offline', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: false });
    const repo = createWorkoutPlayerRepository({ backend, store });
    await repo.logSet(logSetInput({ clientOperationId: 'op-1' }));

    const result = await repo.completeWorkout(completeInput());

    expect(result.success).toBe(false);
    expect(state.completed).toBe(false);
    // The set is kept locally, not lost.
    expect(await store.loadSets('wl-1')).toHaveLength(1);
  });

  it('closes the originating scheduled session and stores one proposal per exercise', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: true });
    const repo = createWorkoutPlayerRepository({ backend, store });
    await repo.logSet(logSetInput({ clientOperationId: 'op-1' }));

    const result = await repo.completeWorkout(completeInput());

    expect(result.success).toBe(true);
    // The roadmap-11 gap is closed: the planner will no longer show it as planned.
    expect(state.scheduledSessionStatus).toBe('completed');
    // One proposal for the single template exercise (ex-1).
    expect(state.proposals).toHaveLength(1);
    expect(state.proposals[0]?.exerciseId).toBe('ex-1');
    expect(state.proposals[0]?.templateExerciseId).toBe('te-1');
  });

  it('proposes an increase when two completed exposures qualify', async () => {
    const store = createMemoryWorkoutStore();
    // Two prior qualifying exposures for ex-1 (top of range, controlled, easy).
    const qualifyingSet = (workoutLogId: string, exposureAt: string) => ({
      discomfortScore: 1,
      effortScore: 7,
      exerciseId: 'ex-1',
      exposureAt,
      repetitions: 12,
      techniqueControlled: true,
      weightKg: 40,
      workoutLogId,
    });
    const { backend, state } = createFake({
      exposures: [
        qualifyingSet('wl-1', '2026-07-12T10:00:00.000Z'),
        qualifyingSet('wl-1', '2026-07-12T10:05:00.000Z'),
        qualifyingSet('wl-0', '2026-07-05T10:00:00.000Z'),
        qualifyingSet('wl-0', '2026-07-05T10:05:00.000Z'),
      ],
      online: true,
    });
    const repo = createWorkoutPlayerRepository({ backend, store });
    await repo.logSet(logSetInput({ clientOperationId: 'op-1' }));

    await repo.completeWorkout(completeInput());

    expect(state.proposals[0]?.decision).toBe('increase');
    expect(state.proposals[0]?.proposedWeightKg).toBe(42.5);
  });

  it('still completes the workout when storing proposals fails', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({
      failProposalInsert: true,
      online: true,
    });
    const repo = createWorkoutPlayerRepository({ backend, store });
    await repo.logSet(logSetInput({ clientOperationId: 'op-1' }));

    const result = await repo.completeWorkout(completeInput());

    // A progression failure never undoes a saved, completed workout.
    expect(result.success).toBe(true);
    expect(state.completed).toBe(true);
    expect(state.proposals).toHaveLength(0);
  });

  it('records an accept/dismiss decision on a proposal', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createFake({ online: true });
    const repo = createWorkoutPlayerRepository({ backend, store });

    const accepted = await repo.decideProposal({
      decidedAtIso: '2026-07-12T11:00:00.000Z',
      proposalId: 'prop-1',
      status: 'accepted',
      userId: 'user-1',
    });

    expect(accepted.ok).toBe(true);
    expect(state.decided).toEqual([
      { proposalId: 'prop-1', status: 'accepted' },
    ]);
  });
});
