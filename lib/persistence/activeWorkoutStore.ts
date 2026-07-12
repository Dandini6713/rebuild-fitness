// Local-first persistence for an active strength workout (docs/04 §4.4/§4.5). A
// completed set is written here *first*, synchronously durable, before any network
// call, so a set is never lost when the app is backgrounded, the phone locks or
// connectivity drops. Supabase sync is secondary and reconciles from this store.
//
// The store is a narrow interface so the player repository is testable without a
// device: the in-memory implementation below backs tests and web, and the SQLite
// implementation (sqliteWorkoutStore.ts, native only) backs the phone. Both dedupe
// on `clientOperationId`, the stable per-set id that also drives no-duplicate sync
// against the set_logs unique constraint.

// A single recorded set held locally. `synced` tracks whether it has reached
// Supabase yet; unsynced rows are replayed on reconnect. `clientOperationId` is the
// stable idempotency key (a UUID) generated once when the set is first recorded.
export type PersistedSet = {
  clientOperationId: string;
  workoutLogId: string;
  exerciseId: string;
  // The exercise's order within the template. Held locally so a set logged
  // offline can rebuild its exercise_logs parent on reconnect without re-reading
  // the template — the replay is fully self-contained.
  exerciseOrder: number;
  setNumber: number;
  weightKg: number | null;
  repetitions: number | null;
  effortScore: number | null;
  discomfortScore: number | null;
  // Whether the lifter marked technique as controlled on this set. Null when not
  // captured; the strength-progression rule (docs/06 §6.4) treats null as "not
  // controlled" and never proposes an increase off it.
  techniqueControlled: boolean | null;
  completedAt: string;
  synced: boolean;
};

export type ActiveWorkoutStore = {
  // Persist (or replace, by operation id) one set. Durable before any sync.
  saveSet(set: PersistedSet): Promise<void>;
  // All sets recorded for a workout, oldest first, for resuming a live session.
  loadSets(workoutLogId: string): Promise<PersistedSet[]>;
  // Mark a set as reached-Supabase once its sync (or an idempotent replay) succeeds.
  markSynced(clientOperationId: string): Promise<void>;
  // Sets for a workout still awaiting sync, oldest first, for reconnect replay.
  listUnsynced(workoutLogId: string): Promise<PersistedSet[]>;
  // Drop a finished workout's local rows once it is safely synced and completed.
  clearWorkout(workoutLogId: string): Promise<void>;
};

function byCompletedAt(a: PersistedSet, b: PersistedSet): number {
  return a.completedAt.localeCompare(b.completedAt);
}

// In-memory store: the source of truth in tests and on web, and the shared shape
// the SQLite store mirrors. Keyed by operation id so re-saving the same set (a
// retry) overwrites rather than duplicates.
export function createMemoryWorkoutStore(): ActiveWorkoutStore {
  const sets = new Map<string, PersistedSet>();
  return {
    async clearWorkout(workoutLogId) {
      for (const [key, set] of sets) {
        if (set.workoutLogId === workoutLogId) {
          sets.delete(key);
        }
      }
    },
    async listUnsynced(workoutLogId) {
      return [...sets.values()]
        .filter((set) => set.workoutLogId === workoutLogId && !set.synced)
        .sort(byCompletedAt);
    },
    async loadSets(workoutLogId) {
      return [...sets.values()]
        .filter((set) => set.workoutLogId === workoutLogId)
        .sort(byCompletedAt);
    },
    async markSynced(clientOperationId) {
      const existing = sets.get(clientOperationId);
      if (existing) {
        sets.set(clientOperationId, { ...existing, synced: true });
      }
    },
    async saveSet(set) {
      sets.set(set.clientOperationId, { ...set });
    },
  };
}
