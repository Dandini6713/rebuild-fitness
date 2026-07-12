import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { useWorkoutPlayer } from '@/features/workouts/useWorkoutPlayer';
import type {
  LoadResult,
  PlayerReadModel,
  WorkoutPlayerRepository,
} from '@/features/workouts/workoutPlayerRepository';

// A signed-in user so the hook loads and writes carry an owner id.
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = new Date('2026-07-12T10:03:05.000Z');

const model = (): PlayerReadModel => ({
  exercises: [
    {
      exerciseId: 'ex-1',
      name: 'Leg press',
      order: 1,
      previous: null,
      repMax: 12,
      repMin: 8,
      restSeconds: 90,
      slug: 'leg-press',
      targetSets: 2,
    },
  ],
  loggedSets: [],
  logId: 'wl-1',
  startedAt: '2026-07-12T10:00:00.000Z',
  workoutName: 'Strength A',
});

function repository(
  overrides: Partial<WorkoutPlayerRepository> = {},
): WorkoutPlayerRepository {
  return {
    completeWorkout: jest.fn<WorkoutPlayerRepository['completeWorkout']>(
      async () => ({ success: true, syncedCount: 0 }),
    ),
    loadSession: jest.fn<WorkoutPlayerRepository['loadSession']>(
      async (): Promise<LoadResult> => ({ model: model(), status: 'ready' }),
    ),
    logSet: jest.fn<WorkoutPlayerRepository['logSet']>(async (input) => ({
      set: {
        discomfortScore: input.discomfortScore,
        effortScore: input.effortScore,
        exerciseId: input.exerciseId,
        repetitions: input.repetitions,
        setNumber: input.setNumber,
        weightKg: input.weightKg,
      },
      synced: false,
    })),
    syncPending: jest.fn<WorkoutPlayerRepository['syncPending']>(async () => 0),
    ...overrides,
  };
}

async function renderPlayer(repo: WorkoutPlayerRepository) {
  return renderHook(() =>
    useWorkoutPlayer('sess-1', {
      createOperationId: () => 'op-1',
      now: NOW,
      repository: repo,
    }),
  );
}

describe('useWorkoutPlayer', () => {
  it('loads and continues the session for the signed-in user', async () => {
    const repo = repository();
    const { result } = await renderPlayer(repo);

    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(repo.loadSession).toHaveBeenCalledWith({
      nowIso: NOW.toISOString(),
      scheduledSessionId: 'sess-1',
      userId: 'user-1',
    });
    if (result.current.state.status !== 'ready') {
      return;
    }
    expect(result.current.state.workoutName).toBe('Strength A');
    expect(result.current.state.elapsedSeconds).toBe(185);
  });

  it('records a set local-first and reflects it, noting it is not yet synced', async () => {
    const repo = repository();
    const { result } = await renderPlayer(repo);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.logSet();
    });

    await waitFor(() => {
      const state = result.current.state;
      expect(state.status).toBe('ready');
      if (state.status === 'ready') {
        expect(state.setsForExercise).toHaveLength(1);
      }
    });
    expect(repo.logSet).toHaveBeenCalledWith(
      expect.objectContaining({
        clientOperationId: 'op-1',
        exerciseId: 'ex-1',
        exerciseOrder: 1,
        logId: 'wl-1',
        setNumber: 1,
        userId: 'user-1',
      }),
    );
    const state = result.current.state;
    if (state.status === 'ready') {
      expect(state.lastSetSynced).toBe(false);
      // The rest timer begins after a set is recorded.
      expect(state.rest.active).toBe(true);
    }
  });

  it('finishes the workout and calls back on success', async () => {
    const repo = repository();
    const { result } = await renderPlayer(repo);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    const onComplete = jest.fn();
    await act(async () => {
      result.current.endWorkout(onComplete);
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(repo.completeWorkout).toHaveBeenCalled();
  });

  it('is unavailable when no repository is configured', async () => {
    const { result } = await renderHook(() =>
      useWorkoutPlayer('sess-1', { now: NOW, repository: null }),
    );
    expect(result.current.state.status).toBe('unavailable');
  });
});
