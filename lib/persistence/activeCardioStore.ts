// Local-first resume state for an active cardio session (docs/04 §4.4/§4.5). Unlike
// the strength store (which holds a durable row per completed set), a run-walk
// session has no per-set data — the only thing worth surviving a background, a lock
// or a crash is enough to RESUME mid-interval: which session, its clock, and whether
// it is paused. So this store is deliberately MINIMAL: one small record per active
// session, written durably before any network call. The synced record of a finished
// session is the cardio_logs summary (written on completion), not this.
//
// A narrow interface, so the repository is testable without a device: the in-memory
// implementation below backs tests and web; the SQLite implementation
// (sqliteCardioStore.ts, native only) backs the phone. Both key on cardioLogId, so
// re-saving the same session's state overwrites rather than duplicates.

// The minimal state needed to resume. The interval position is DERIVED from the
// clock (startedAtMs / pausedAccumMs / pausedAtMs) against the template's steps, so
// nothing per-segment is stored — recomputing it on resume is exact and cheap.
export type PersistedCardioState = {
  cardioLogId: string;
  scheduledSessionId: string;
  cardioTemplateId: string | null;
  startedAtMs: number;
  pausedAccumMs: number;
  // Set while the session is paused; null while running.
  pausedAtMs: number | null;
  // 'active' while live (including paused); 'completed' once finished and the
  // summary is written. A completed record is cleared, so this is chiefly a guard.
  status: 'active' | 'completed';
  updatedAtMs: number;
};

export type ActiveCardioStore = {
  // Persist (or replace, by cardio log id) the resume state. Durable before sync.
  saveState(state: PersistedCardioState): Promise<void>;
  // The stored resume state for a session, or null if none is held.
  loadState(cardioLogId: string): Promise<PersistedCardioState | null>;
  // Drop a session's local state once it is safely completed (or abandoned).
  clearState(cardioLogId: string): Promise<void>;
};

// In-memory store: the source of truth in tests and on web, and the shape the
// SQLite store mirrors. Keyed by cardio log id so a re-save overwrites.
export function createMemoryCardioStore(): ActiveCardioStore {
  const states = new Map<string, PersistedCardioState>();
  return {
    async clearState(cardioLogId) {
      states.delete(cardioLogId);
    },
    async loadState(cardioLogId) {
      const existing = states.get(cardioLogId);
      return existing ? { ...existing } : null;
    },
    async saveState(state) {
      states.set(state.cardioLogId, { ...state });
    },
  };
}
