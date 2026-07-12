import { describe, expect, it } from '@jest/globals';

import {
  createMemoryWorkoutStore,
  type PersistedSet,
} from '@/lib/persistence/activeWorkoutStore';

const persisted = (overrides: Partial<PersistedSet> = {}): PersistedSet => ({
  clientOperationId: 'op-1',
  completedAt: '2026-07-12T10:00:00.000Z',
  discomfortScore: 0,
  effortScore: 7,
  exerciseId: 'ex-1',
  exerciseOrder: 1,
  repetitions: 10,
  setNumber: 1,
  synced: false,
  weightKg: 20,
  workoutLogId: 'wl-1',
  ...overrides,
});

describe('memory workout store', () => {
  it('saves a set and reads it back, oldest first', async () => {
    const store = createMemoryWorkoutStore();
    await store.saveSet(
      persisted({
        clientOperationId: 'op-2',
        completedAt: '2026-07-12T10:05:00.000Z',
        setNumber: 2,
      }),
    );
    await store.saveSet(persisted({ clientOperationId: 'op-1' }));
    const sets = await store.loadSets('wl-1');
    expect(sets.map((set) => set.clientOperationId)).toEqual(['op-1', 'op-2']);
  });

  it('re-saving the same operation id replaces rather than duplicates', async () => {
    const store = createMemoryWorkoutStore();
    await store.saveSet(persisted({ repetitions: 10 }));
    await store.saveSet(persisted({ repetitions: 12 }));
    const sets = await store.loadSets('wl-1');
    expect(sets).toHaveLength(1);
    expect(sets[0]?.repetitions).toBe(12);
  });

  it('tracks which sets still need syncing', async () => {
    const store = createMemoryWorkoutStore();
    await store.saveSet(persisted({ clientOperationId: 'op-1' }));
    await store.saveSet(persisted({ clientOperationId: 'op-2', setNumber: 2 }));
    await store.markSynced('op-1');
    const pending = await store.listUnsynced('wl-1');
    expect(pending.map((set) => set.clientOperationId)).toEqual(['op-2']);
  });

  it('clears a finished workout', async () => {
    const store = createMemoryWorkoutStore();
    await store.saveSet(persisted());
    await store.clearWorkout('wl-1');
    expect(await store.loadSets('wl-1')).toEqual([]);
  });
});
