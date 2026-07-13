import { describe, expect, it } from '@jest/globals';

import {
  type CardioPlayerBackend,
  createCardioPlayerRepository,
} from '@/features/cardio/cardioPlayerRepository';
import { createMemoryCardioStore } from '@/lib/persistence/activeCardioStore';

// A stand-in for the Supabase backend. It records the writes (created logs,
// completed logs, closed sessions) so the local-first and completion behaviour can
// be proven without a database, and can be switched offline to simulate a dropped
// connection on the completion write.
function createFake(
  options: {
    sessionType?: string | null;
    hasTemplate?: boolean;
    inProgressLog?: {
      id: string;
      startedAt: string;
      cardioTemplateId: string | null;
    } | null;
    steps?: number;
    completeOffline?: boolean;
    failSession?: boolean;
  } = {},
) {
  const state = {
    closedSessions: [] as string[],
    completed: [] as {
      id: string;
      durationSeconds: number;
      sessionEffort: number | null;
    }[],
    createdLogs: 0,
  };

  const template =
    options.hasTemplate === false
      ? null
      : {
          estimatedMinutes: 27,
          id: 'ct-1',
          name: 'Run-walk stage 1',
          sessionType: 'run_walk',
          stageNumber: 1,
        };

  const steps = Array.from({ length: options.steps ?? 3 }, (_, i) => ({
    activityType: i === 0 ? 'warmup' : i % 2 === 1 ? 'run' : 'walk',
    cueText: 'cue',
    durationSeconds: i === 0 ? 300 : 60,
    order: i + 1,
  }));

  const backend: CardioPlayerBackend = {
    async completeLog(input) {
      if (options.completeOffline) {
        return { error: { message: 'offline' } };
      }
      state.completed.push({
        durationSeconds: input.durationSeconds,
        id: input.cardioLogId,
        sessionEffort: input.sessionEffort,
      });
      return { error: null };
    },
    async createLog(input) {
      state.createdLogs += 1;
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
      return { data: template, error: null };
    },
    async fetchScheduledSession() {
      if (options.sessionType === null) {
        return { data: null, error: null };
      }
      return {
        data: { id: 'ss-1', session_type: options.sessionType ?? 'cardio' },
        error: null,
      };
    },
    async fetchTemplate() {
      return { data: template, error: null };
    },
    async fetchTemplateSteps() {
      return { data: steps, error: null };
    },
    async findInProgressLog() {
      return { data: options.inProgressLog ?? null, error: null };
    },
    async updateScheduledSessionStatus(input) {
      if (options.failSession) {
        return { error: { message: 'nope' } };
      }
      state.closedSessions.push(input.scheduledSessionId);
      return { error: null };
    },
  };

  return { backend, state };
}

function makeRepo(fake: ReturnType<typeof createFake>) {
  const store = createMemoryCardioStore();
  const repository = createCardioPlayerRepository({
    backend: fake.backend,
    store,
  });
  return { repository, store };
}

const LOAD = {
  nowIso: '2026-07-13T09:00:00.000Z',
  scheduledSessionId: 'ss-1',
  userId: 'user-1',
};

describe('cardio player repository — load', () => {
  it('starts a fresh session: creates one cardio_log and seeds local resume state', async () => {
    const fake = createFake();
    const { repository, store } = makeRepo(fake);
    const result = await repository.loadSession(LOAD);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(fake.state.createdLogs).toBe(1);
    expect(result.model.startedFresh).toBe(true);
    expect(result.model.steps).toHaveLength(3);
    expect(await store.loadState('cl-new')).toMatchObject({ status: 'active' });
  });

  it('resumes an in-progress log without creating a second one, and keeps its template', async () => {
    const fake = createFake({
      inProgressLog: {
        cardioTemplateId: 'ct-1',
        id: 'cl-existing',
        startedAt: '2026-07-13T08:00:00.000Z',
      },
    });
    const { repository, store } = makeRepo(fake);
    // A stored active state means this is a resume, not a fresh start.
    await store.saveState({
      cardioLogId: 'cl-existing',
      cardioTemplateId: 'ct-1',
      pausedAccumMs: 0,
      pausedAtMs: null,
      scheduledSessionId: 'ss-1',
      startedAtMs: Date.parse('2026-07-13T08:00:00.000Z'),
      status: 'active',
      updatedAtMs: Date.parse('2026-07-13T08:00:00.000Z'),
    });
    const result = await repository.loadSession(LOAD);
    expect(fake.state.createdLogs).toBe(0);
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.model.cardioLogId).toBe('cl-existing');
    expect(result.model.startedFresh).toBe(false);
    expect(result.model.clock.startedAtMs).toBe(
      Date.parse('2026-07-13T08:00:00.000Z'),
    );
  });

  it('returns not-cardio for a non-cardio session', async () => {
    const fake = createFake({ sessionType: 'strength' });
    const { repository } = makeRepo(fake);
    expect((await repository.loadSession(LOAD)).status).toBe('not-cardio');
  });

  it('returns empty when the scheduled session is missing', async () => {
    const fake = createFake({ sessionType: null });
    const { repository } = makeRepo(fake);
    expect((await repository.loadSession(LOAD)).status).toBe('empty');
  });

  it('returns no-programme when no cardio template is seeded', async () => {
    const fake = createFake({ hasTemplate: false });
    const { repository } = makeRepo(fake);
    expect((await repository.loadSession(LOAD)).status).toBe('no-programme');
  });

  it('surfaces a read error', async () => {
    const fake = createFake();
    fake.backend.fetchScheduledSession = async () => ({
      data: null,
      error: { message: 'boom' },
    });
    const { repository } = makeRepo(fake);
    expect((await repository.loadSession(LOAD)).status).toBe('error');
  });
});

describe('cardio player repository — complete', () => {
  const COMPLETE = {
    cardioLogId: 'cl-1',
    completedAtIso: '2026-07-13T09:30:00.000Z',
    durationSeconds: 1620,
    scheduledSessionId: 'ss-1',
    sessionEffort: 6,
    userId: 'user-1',
  };

  it('writes exactly one cardio_logs summary, closes the session and clears local state', async () => {
    const fake = createFake();
    const { repository, store } = makeRepo(fake);
    await store.saveState({
      cardioLogId: 'cl-1',
      cardioTemplateId: 'ct-1',
      pausedAccumMs: 0,
      pausedAtMs: null,
      scheduledSessionId: 'ss-1',
      startedAtMs: 0,
      status: 'active',
      updatedAtMs: 0,
    });
    const result = await repository.completeSession(COMPLETE);
    expect(result.success).toBe(true);
    expect(fake.state.completed).toEqual([
      { durationSeconds: 1620, id: 'cl-1', sessionEffort: 6 },
    ]);
    expect(fake.state.closedSessions).toEqual(['ss-1']);
    expect(await store.loadState('cl-1')).toBeNull();
  });

  it('fails honestly when offline and keeps the local state for a retry', async () => {
    const fake = createFake({ completeOffline: true });
    const { repository, store } = makeRepo(fake);
    await store.saveState({
      cardioLogId: 'cl-1',
      cardioTemplateId: 'ct-1',
      pausedAccumMs: 0,
      pausedAtMs: null,
      scheduledSessionId: 'ss-1',
      startedAtMs: 0,
      status: 'active',
      updatedAtMs: 0,
    });
    const result = await repository.completeSession(COMPLETE);
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.message).toMatch(/offline/i);
    expect(await store.loadState('cl-1')).not.toBeNull();
  });

  it('still succeeds when closing the scheduled session fails (best-effort)', async () => {
    const fake = createFake({ failSession: true });
    const { repository } = makeRepo(fake);
    const result = await repository.completeSession(COMPLETE);
    expect(result.success).toBe(true);
    expect(fake.state.completed).toHaveLength(1);
  });
});

describe('cardio player repository — saveClock', () => {
  it('persists the pause-aware clock for resume', async () => {
    const fake = createFake();
    const { repository, store } = makeRepo(fake);
    await repository.saveClock({
      cardioLogId: 'cl-1',
      cardioTemplateId: 'ct-1',
      clock: { pausedAccumMs: 3_000, pausedAtMs: 5_000, startedAtMs: 0 },
      nowMs: 6_000,
      scheduledSessionId: 'ss-1',
    });
    const stored = await store.loadState('cl-1');
    expect(stored).toMatchObject({ pausedAccumMs: 3_000, pausedAtMs: 5_000 });
  });
});
