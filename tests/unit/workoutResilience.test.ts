// Roadmap 26 (resilience, docs/10 §10.6 "Poor connectivity and airplane mode during a
// workout" + "Backgrounding and phone locking during timers"). This is the ONE resilience
// behaviour the roadmap names explicitly, so it is proven as a real scenario, not claimed:
//
//  - in-progress session state SURVIVES backgrounding and a lock (the durable device store
//    outlives the player instance, so a relaunch resumes it);
//  - a logged set/segment is NEVER lost when a network write fails (local-first);
//  - a replay on reconnect NEVER double-writes (the client_operation_id dedupe holds under a
//    flaky, partial-failure network).
//
// The stores are the in-memory implementations of the same interface the SQLite device
// stores implement, so this exercises the real local-first + dedupe code paths.

import { describe, expect, it } from '@jest/globals';

import {
  type CardioPlayerBackend,
  createCardioPlayerRepository,
} from '@/features/cardio/cardioPlayerRepository';
import {
  createWorkoutPlayerRepository,
  type ProgressionProposalRow,
  type WorkoutPlayerBackend,
} from '@/features/workouts/workoutPlayerRepository';
import { createMemoryCardioStore } from '@/lib/persistence/activeCardioStore';
import { createMemoryWorkoutStore } from '@/lib/persistence/activeWorkoutStore';

// A stand-in strength backend that enforces the set_logs uniqueness guarantees exactly as
// the database would (client_operation_id, and exercise_log_id + set_number), and whose
// `online` flag can be flipped mid-scenario to simulate a flaky connection.
function createWorkoutFake() {
  const state = {
    completed: false,
    online: true,
    scheduledSessionStatus: null as string | null,
    proposals: [] as ProgressionProposalRow[],
    exerciseLogSeq: 0,
    exerciseLogs: new Map<string, string>(),
    sets: [] as {
      clientOperationId: string;
      exerciseLogId: string;
      setNumber: number;
    }[],
  };

  const backend: WorkoutPlayerBackend = {
    async completeLog() {
      if (!state.online) return { error: { message: 'offline' } };
      state.completed = true;
      return { error: null };
    },
    async createLog() {
      return {
        data: { id: 'wl-created', started_at: '2026-07-12T10:00:00.000Z' },
        error: null,
      };
    },
    async ensureExerciseLog({ exerciseId, workoutLogId }) {
      if (!state.online) return { data: null, error: { message: 'offline' } };
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
      return { data: [], error: null };
    },
    async fetchRecordedSets() {
      return { data: [], error: null };
    },
    async fetchScheduledSession(id) {
      return {
        data: { id, session_type: 'strength', template_id: 'tmpl-1' },
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
      return { data: [], error: null };
    },
    async insertProgressionProposal(row) {
      state.proposals.push(row);
      return { error: null };
    },
    async fetchLatestProposals() {
      return { data: [], error: null };
    },
    async decideProposal() {
      return { error: null };
    },
    async updateScheduledSessionStatus({ status }) {
      state.scheduledSessionStatus = status;
      return { error: null };
    },
    async findInProgressLog() {
      return {
        data: { id: 'wl-1', started_at: '2026-07-12T10:00:00.000Z' },
        error: null,
      };
    },
    async insertSet(row) {
      if (!state.online)
        return { duplicate: false, error: { message: 'offline' } };
      const clash = state.sets.some(
        (set) =>
          set.clientOperationId === row.clientOperationId ||
          (set.exerciseLogId === row.exerciseLogId &&
            set.setNumber === row.setNumber),
      );
      if (clash) return { duplicate: true, error: null };
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

const setInput = (op: string, setNumber: number) => ({
  clientOperationId: op,
  completedAtIso: '2026-07-12T10:01:00.000Z',
  discomfortScore: 0,
  effortScore: 7,
  exerciseId: 'ex-1',
  exerciseOrder: 1,
  logId: 'wl-1',
  repetitions: 10,
  setNumber,
  techniqueControlled: true,
  userId: 'user-1',
  weightKg: 20 + setNumber,
});

describe('active strength workout — backgrounding, lock and poor connectivity', () => {
  it('never loses a set, resumes after a relaunch, and never double-writes on reconnect', async () => {
    const store = createMemoryWorkoutStore();
    const { backend, state } = createWorkoutFake();

    // The phone is locked with no signal (airplane mode). The lifter logs two sets.
    state.online = false;
    const player1 = createWorkoutPlayerRepository({ backend, store });
    const r1 = await player1.logSet(setInput('op-1', 1));
    const r2 = await player1.logSet(setInput('op-2', 2));

    // Neither reached the server, but both are told "saved, not yet synced" — not an error.
    expect(r1.synced).toBe(false);
    expect(r2.synced).toBe(false);
    expect(state.sets).toHaveLength(0);

    // SURVIVES BACKGROUNDING: the durable store still holds both sets, queued for sync.
    expect(await store.loadSets('wl-1')).toHaveLength(2);
    expect(await store.listUnsynced('wl-1')).toHaveLength(2);

    // The app is killed while backgrounded and relaunched — a FRESH player over the SAME
    // durable device store. The two offline sets are still there (in the durable queue the
    // new player reads) to resume from.
    const player2 = createWorkoutPlayerRepository({ backend, store });
    expect(await store.loadSets('wl-1')).toHaveLength(2);

    // Connectivity returns; the queued sets flush exactly once.
    state.online = true;
    const flushed = await player2.syncPending({
      logId: 'wl-1',
      userId: 'user-1',
    });
    expect(flushed).toBe(2);
    expect(state.sets).toHaveLength(2);

    // POOR CONNECTIVITY mid-session: the next write drops out, then recovers.
    state.online = false;
    const r3 = await player2.logSet(setInput('op-3', 3));
    expect(r3.synced).toBe(false);
    expect(state.sets).toHaveLength(2); // set 3 held locally, not lost

    state.online = true;
    const r4 = await player2.logSet(setInput('op-4', 4));
    expect(r4.synced).toBe(true);
    expect(state.sets).toHaveLength(3); // set 4 wrote through; set 3 still pending

    // Reconnect flush picks up the straggler (set 3).
    await player2.syncPending({ logId: 'wl-1', userId: 'user-1' });
    expect(state.sets).toHaveLength(4);

    // NO DOUBLE-WRITE: replaying the flush (a duplicate reconnect) changes nothing.
    await player2.syncPending({ logId: 'wl-1', userId: 'user-1' });
    expect(state.sets).toHaveLength(4);

    // NO DOUBLE-WRITE even if a set is re-queued (app killed before it recorded the sync):
    // the client_operation_id collision is treated as a benign duplicate.
    await store.saveSet({
      clientOperationId: 'op-2',
      completedAt: '2026-07-12T10:01:00.000Z',
      discomfortScore: 0,
      effortScore: 7,
      exerciseId: 'ex-1',
      exerciseOrder: 1,
      repetitions: 10,
      setNumber: 2,
      synced: false,
      techniqueControlled: true,
      weightKg: 22,
      workoutLogId: 'wl-1',
    });
    await player2.syncPending({ logId: 'wl-1', userId: 'user-1' });
    expect(state.sets).toHaveLength(4);

    // All four unique sets are on the server exactly once.
    const opIds = new Set(state.sets.map((set) => set.clientOperationId));
    expect(opIds).toEqual(new Set(['op-1', 'op-2', 'op-3', 'op-4']));

    // Finishing now succeeds and clears the durable queue.
    const done = await player2.completeWorkout({
      completedAtIso: '2026-07-12T10:30:00.000Z',
      logId: 'wl-1',
      scheduledSessionId: 'sess-1',
      sessionEffort: null,
      templateId: 'tmpl-1',
      userId: 'user-1',
    });
    expect(done.success).toBe(true);
    expect(state.scheduledSessionStatus).toBe('completed');
    expect(await store.loadSets('wl-1')).toEqual([]);
  });
});

// A toggle-able cardio backend: the resume clock is local-first, and the ONE synced record
// (the cardio_logs summary) must survive an offline completion and write exactly once on
// reconnect.
function createCardioFake() {
  const state = {
    online: true,
    completed: [] as { id: string; durationSeconds: number }[],
    closedSessions: [] as string[],
  };
  const backend: CardioPlayerBackend = {
    async completeLog(input) {
      if (!state.online) return { error: { message: 'offline' } };
      state.completed.push({
        durationSeconds: input.durationSeconds,
        id: input.cardioLogId,
      });
      return { error: null };
    },
    async createLog(input) {
      return {
        data: {
          cardioTemplateId: input.cardioTemplateId,
          id: 'cl-new',
          startedAt: input.startedAtIso,
        },
        error: null,
      };
    },
    async fetchDefaultTemplate() {
      return { data: null, error: null };
    },
    async fetchScheduledSession() {
      return { data: { id: 'ss-1', session_type: 'cardio' }, error: null };
    },
    async fetchTemplate() {
      return { data: null, error: null };
    },
    async fetchTemplateSteps() {
      return { data: [], error: null };
    },
    async findInProgressLog() {
      return { data: null, error: null };
    },
    async updateScheduledSessionStatus(input) {
      state.closedSessions.push(input.scheduledSessionId);
      return { error: null };
    },
  };
  return { backend, state };
}

describe('active cardio session — backgrounding and offline completion', () => {
  it('resumes its clock after a relaunch and writes exactly one summary on reconnect', async () => {
    const store = createMemoryCardioStore();
    const { backend, state } = createCardioFake();

    // Mid-interval, the app saves its pause-aware resume clock (as it does on background).
    const player1 = createCardioPlayerRepository({ backend, store });
    await player1.saveClock({
      cardioLogId: 'cl-1',
      cardioTemplateId: 'ct-1',
      clock: { pausedAccumMs: 4_000, pausedAtMs: null, startedAtMs: 0 },
      nowMs: 60_000,
      scheduledSessionId: 'ss-1',
    });

    // App killed + relaunched: a fresh player over the same durable store still has the
    // clock to resume from (interval position is derived from it, so nothing is lost).
    const resumed = await store.loadState('cl-1');
    expect(resumed).toMatchObject({ pausedAccumMs: 4_000, status: 'active' });

    const player2 = createCardioPlayerRepository({ backend, store });
    const complete = {
      cardioLogId: 'cl-1',
      completedAtIso: '2026-07-13T09:30:00.000Z',
      durationSeconds: 1620,
      scheduledSessionId: 'ss-1',
      sessionEffort: 6,
      userId: 'user-1',
    };

    // Completing while offline fails HONESTLY and keeps the local state for a retry.
    state.online = false;
    const offline = await player2.completeSession(complete);
    expect(offline.success).toBe(false);
    expect(await store.loadState('cl-1')).not.toBeNull();

    // On reconnect it completes, writing exactly one summary and clearing local state.
    state.online = true;
    const online = await player2.completeSession(complete);
    expect(online.success).toBe(true);
    expect(state.completed).toEqual([{ durationSeconds: 1620, id: 'cl-1' }]);
    expect(await store.loadState('cl-1')).toBeNull();
  });
});
