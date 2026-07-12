// The native, durable implementation of ActiveWorkoutStore, backed by expo-sqlite
// (docs/04 §4.1 names SQLite as the local persistence for offline workout state).
// A completed set is written to this on-device database immediately, before any
// network sync, so it survives backgrounding, a locked phone and lost connectivity
// (docs/04 §4.4/§4.5). It is loaded lazily by createActiveWorkoutStore on native
// only; tests and web use the in-memory store instead, so nothing here is imported
// off-device.

import * as SQLite from 'expo-sqlite';

import type { ActiveWorkoutStore, PersistedSet } from './activeWorkoutStore';

// The on-device table mirrors PersistedSet one-to-one. The operation id is the
// primary key, so re-saving the same set (a retry) replaces rather than
// duplicates, matching the in-memory store's semantics and the set_logs
// idempotency key used for sync.
const CREATE_TABLE = `
  create table if not exists active_set_logs (
    client_operation_id text primary key not null,
    workout_log_id text not null,
    exercise_id text not null,
    exercise_order integer not null,
    set_number integer not null,
    weight_kg real,
    repetitions integer,
    effort_score integer,
    discomfort_score integer,
    completed_at text not null,
    synced integer not null default 0
  );
`;

type Row = {
  client_operation_id: string;
  workout_log_id: string;
  exercise_id: string;
  exercise_order: number;
  set_number: number;
  weight_kg: number | null;
  repetitions: number | null;
  effort_score: number | null;
  discomfort_score: number | null;
  completed_at: string;
  synced: number;
};

function toPersisted(row: Row): PersistedSet {
  return {
    clientOperationId: row.client_operation_id,
    completedAt: row.completed_at,
    discomfortScore: row.discomfort_score,
    effortScore: row.effort_score,
    exerciseId: row.exercise_id,
    exerciseOrder: row.exercise_order,
    repetitions: row.repetitions,
    setNumber: row.set_number,
    synced: row.synced === 1,
    weightKg: row.weight_kg,
    workoutLogId: row.workout_log_id,
  };
}

export function createSqliteWorkoutStore(): ActiveWorkoutStore {
  const db = SQLite.openDatabaseSync('rebuild-active-workout.db');
  db.execSync(CREATE_TABLE);

  return {
    async clearWorkout(workoutLogId) {
      await db.runAsync(
        'delete from active_set_logs where workout_log_id = ?',
        [workoutLogId],
      );
    },
    async listUnsynced(workoutLogId) {
      const rows = await db.getAllAsync<Row>(
        'select * from active_set_logs where workout_log_id = ? and synced = 0 order by completed_at asc',
        [workoutLogId],
      );
      return rows.map(toPersisted);
    },
    async loadSets(workoutLogId) {
      const rows = await db.getAllAsync<Row>(
        'select * from active_set_logs where workout_log_id = ? order by completed_at asc',
        [workoutLogId],
      );
      return rows.map(toPersisted);
    },
    async markSynced(clientOperationId) {
      await db.runAsync(
        'update active_set_logs set synced = 1 where client_operation_id = ?',
        [clientOperationId],
      );
    },
    async saveSet(set) {
      // insert-or-replace on the operation-id primary key keeps a retry idempotent.
      await db.runAsync(
        `insert or replace into active_set_logs (
          client_operation_id, workout_log_id, exercise_id, exercise_order, set_number,
          weight_kg, repetitions, effort_score, discomfort_score,
          completed_at, synced
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          set.clientOperationId,
          set.workoutLogId,
          set.exerciseId,
          set.exerciseOrder,
          set.setNumber,
          set.weightKg,
          set.repetitions,
          set.effortScore,
          set.discomfortScore,
          set.completedAt,
          set.synced ? 1 : 0,
        ],
      );
    },
  };
}
