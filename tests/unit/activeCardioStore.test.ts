import { describe, expect, it } from '@jest/globals';

import {
  createMemoryCardioStore,
  type PersistedCardioState,
} from '@/lib/persistence/activeCardioStore';

function state(
  overrides: Partial<PersistedCardioState> = {},
): PersistedCardioState {
  return {
    cardioLogId: 'cl-1',
    cardioTemplateId: 'ct-1',
    pausedAccumMs: 0,
    pausedAtMs: null,
    scheduledSessionId: 'ss-1',
    startedAtMs: 1_000_000,
    status: 'active',
    updatedAtMs: 1_000_000,
    ...overrides,
  };
}

describe('memory cardio store', () => {
  it('saves and loads a resume state by cardio log id', async () => {
    const store = createMemoryCardioStore();
    await store.saveState(state());
    const loaded = await store.loadState('cl-1');
    expect(loaded).toMatchObject({
      cardioLogId: 'cl-1',
      startedAtMs: 1_000_000,
    });
  });

  it('returns null when nothing is stored', async () => {
    const store = createMemoryCardioStore();
    expect(await store.loadState('missing')).toBeNull();
  });

  it('overwrites (never duplicates) on re-save of the same session', async () => {
    const store = createMemoryCardioStore();
    await store.saveState(state({ pausedAccumMs: 0 }));
    await store.saveState(
      state({ pausedAccumMs: 5_000, pausedAtMs: 1_010_000 }),
    );
    const loaded = await store.loadState('cl-1');
    expect(loaded?.pausedAccumMs).toBe(5_000);
    expect(loaded?.pausedAtMs).toBe(1_010_000);
  });

  it('clears a session state', async () => {
    const store = createMemoryCardioStore();
    await store.saveState(state());
    await store.clearState('cl-1');
    expect(await store.loadState('cl-1')).toBeNull();
  });

  it('returns a copy, so mutating the result does not corrupt the store', async () => {
    const store = createMemoryCardioStore();
    await store.saveState(state());
    const loaded = await store.loadState('cl-1');
    if (loaded) {
      loaded.pausedAccumMs = 999;
    }
    const again = await store.loadState('cl-1');
    expect(again?.pausedAccumMs).toBe(0);
  });

  it('keeps separate sessions independent', async () => {
    const store = createMemoryCardioStore();
    await store.saveState(state({ cardioLogId: 'cl-1' }));
    await store.saveState(
      state({ cardioLogId: 'cl-2', startedAtMs: 2_000_000 }),
    );
    await store.clearState('cl-1');
    expect(await store.loadState('cl-1')).toBeNull();
    expect(await store.loadState('cl-2')).toMatchObject({
      startedAtMs: 2_000_000,
    });
  });
});
