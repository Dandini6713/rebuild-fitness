// The native, durable implementation of ActiveCardioStore, backed by expo-sqlite
// (docs/04 §4.1 names SQLite as the local persistence for offline session state).
// The single resume record for a live cardio session is written to this on-device
// database before any network call, so it survives backgrounding, a locked phone
// and lost connectivity (docs/04 §4.4/§4.5) and lets the player resume mid-interval.
// It is loaded lazily by createActiveCardioStore on native only; tests and web use
// the in-memory store, so nothing here is imported off-device.

import * as SQLite from 'expo-sqlite';

import type {
  ActiveCardioStore,
  PersistedCardioState,
} from './activeCardioStore';

// One row per active cardio session, keyed by cardio log id so re-saving the same
// session's state replaces rather than duplicates. Milliseconds are stored as
// integers; paused_at_ms is nullable (null while running).
const CREATE_TABLE = `
  create table if not exists active_cardio_sessions (
    cardio_log_id text primary key not null,
    scheduled_session_id text not null,
    cardio_template_id text,
    started_at_ms integer not null,
    paused_accum_ms integer not null default 0,
    paused_at_ms integer,
    status text not null default 'active',
    updated_at_ms integer not null
  );
`;

type Row = {
  cardio_log_id: string;
  scheduled_session_id: string;
  cardio_template_id: string | null;
  started_at_ms: number;
  paused_accum_ms: number;
  paused_at_ms: number | null;
  status: string;
  updated_at_ms: number;
};

function toPersisted(row: Row): PersistedCardioState {
  return {
    cardioLogId: row.cardio_log_id,
    cardioTemplateId: row.cardio_template_id,
    pausedAccumMs: row.paused_accum_ms,
    pausedAtMs: row.paused_at_ms,
    scheduledSessionId: row.scheduled_session_id,
    startedAtMs: row.started_at_ms,
    status: row.status === 'completed' ? 'completed' : 'active',
    updatedAtMs: row.updated_at_ms,
  };
}

export function createSqliteCardioStore(): ActiveCardioStore {
  const db = SQLite.openDatabaseSync('rebuild-active-cardio.db');
  db.execSync(CREATE_TABLE);

  return {
    async clearState(cardioLogId) {
      await db.runAsync(
        'delete from active_cardio_sessions where cardio_log_id = ?',
        [cardioLogId],
      );
    },
    async loadState(cardioLogId) {
      const row = await db.getFirstAsync<Row>(
        'select * from active_cardio_sessions where cardio_log_id = ?',
        [cardioLogId],
      );
      return row ? toPersisted(row) : null;
    },
    async saveState(state) {
      await db.runAsync(
        `insert or replace into active_cardio_sessions (
          cardio_log_id, scheduled_session_id, cardio_template_id,
          started_at_ms, paused_accum_ms, paused_at_ms, status, updated_at_ms
        ) values (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          state.cardioLogId,
          state.scheduledSessionId,
          state.cardioTemplateId,
          state.startedAtMs,
          state.pausedAccumMs,
          state.pausedAtMs,
          state.status,
          state.updatedAtMs,
        ],
      );
    },
  };
}
