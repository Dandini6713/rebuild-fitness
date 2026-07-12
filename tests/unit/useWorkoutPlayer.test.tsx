import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { evaluateStrengthProgression } from '@/domain/training/strengthProgression';
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

const model = (overrides: Partial<PlayerReadModel> = {}): PlayerReadModel => ({
  exercises: [
    {
      exerciseId: 'ex-1',
      name: 'Leg press',
      order: 1,
      previous: null,
      proposal: null,
      repMax: 12,
      repMin: 8,
      restSeconds: 90,
      slug: 'leg-press',
      targetSets: 2,
      templateExerciseId: 'te-1',
    },
  ],
  loggedSets: [],
  logId: 'wl-1',
  scheduledSessionId: 'sess-1',
  startedAt: '2026-07-12T10:00:00.000Z',
  templateId: 'tmpl-1',
  workoutName: 'Strength A',
  ...overrides,
});

function repository(
  overrides: Partial<WorkoutPlayerRepository> = {},
): WorkoutPlayerRepository {
  return {
    completeWorkout: jest.fn<WorkoutPlayerRepository['completeWorkout']>(
      async () => ({ success: true, syncedCount: 0 }),
    ),
    decideProposal: jest.fn<WorkoutPlayerRepository['decideProposal']>(
      async () => ({ ok: true }),
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
        techniqueControlled: input.techniqueControlled,
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

  it('logs an untouched technique control as null, and such a set can never earn an increase', async () => {
    const repo = repository();
    const { result } = await renderPlayer(repo);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    // Log a set without ever touching the technique control.
    await act(async () => {
      result.current.logSet();
    });

    const logged = jest.mocked(repo.logSet).mock.calls[0]?.[0];
    // The untouched control persists as null — never assumed controlled.
    expect(logged?.techniqueControlled).toBeNull();

    // End to end: a set whose technique is null can never satisfy the increase
    // standard, even at the top of the range with easy effort and no discomfort —
    // technique alone must be marked controlled for an increase (docs/06 §6.4).
    const decision = evaluateStrengthProgression(
      {
        repMax: 12,
        repMin: 8,
        singleExposureProgression: true,
        targetSets: 1,
        weightIncrementKg: 2.5,
      },
      [
        {
          sets: [
            {
              discomfortScore: 0,
              effortScore: 7,
              repetitions: 12,
              techniqueControlled: logged?.techniqueControlled ?? null,
              weightKg: logged?.weightKg ?? 40,
            },
          ],
        },
      ],
    );
    expect(decision.decision).not.toBe('increase');
    expect(decision.reasons.map((reason) => reason.code)).toContain(
      'technique-uncertain',
    );
  });

  it('finishes the workout, passing the scheduled session and template so it can be closed and evaluated', async () => {
    const repo = repository();
    const { result } = await renderPlayer(repo);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    const onComplete = jest.fn();
    await act(async () => {
      result.current.endWorkout(onComplete);
    });

    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(repo.completeWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        logId: 'wl-1',
        scheduledSessionId: 'sess-1',
        templateId: 'tmpl-1',
        userId: 'user-1',
      }),
    );
  });

  it('accepts a progression proposal, prefilling the suggested weight and clearing it for good', async () => {
    const repo = repository({
      loadSession: jest.fn<WorkoutPlayerRepository['loadSession']>(
        async () => ({
          model: model({
            exercises: [
              {
                exerciseId: 'ex-1',
                name: 'Leg press',
                order: 1,
                previous: null,
                proposal: {
                  currentWeightKg: 40,
                  decision: 'increase',
                  id: 'prop-1',
                  proposedWeightKg: 42.5,
                  reasons: [
                    { code: 'increase-ready', message: 'Nicely done.' },
                  ],
                },
                repMax: 12,
                repMin: 8,
                restSeconds: 90,
                slug: 'leg-press',
                targetSets: 2,
                templateExerciseId: 'te-1',
              },
            ],
          }),
          status: 'ready',
        }),
      ),
    });
    const { result } = await renderPlayer(repo);
    await waitFor(() => {
      const state = result.current.state;
      expect(state.status === 'ready' && state.proposal?.id).toBe('prop-1');
    });

    await act(async () => {
      result.current.acceptProposal();
    });

    expect(repo.decideProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 'prop-1', status: 'accepted' }),
    );
    const state = result.current.state;
    if (state.status === 'ready') {
      // Cleared from view and never shown again...
      expect(state.proposal).toBeNull();
      // ...and the suggested weight is prefilled for the next set.
      expect(state.inputs.weightKg).toBe(42.5);
    }
  });

  it('dismisses a proposal without changing the weight, and it does not reappear', async () => {
    const repo = repository({
      loadSession: jest.fn<WorkoutPlayerRepository['loadSession']>(
        async () => ({
          model: model({
            exercises: [
              {
                exerciseId: 'ex-1',
                name: 'Leg press',
                order: 1,
                previous: null,
                proposal: {
                  currentWeightKg: 40,
                  decision: 'increase',
                  id: 'prop-9',
                  proposedWeightKg: 42.5,
                  reasons: [],
                },
                repMax: 12,
                repMin: 8,
                restSeconds: 90,
                slug: 'leg-press',
                targetSets: 2,
                templateExerciseId: 'te-1',
              },
            ],
          }),
          status: 'ready',
        }),
      ),
    });
    const { result } = await renderPlayer(repo);
    await waitFor(() => {
      const state = result.current.state;
      expect(state.status === 'ready' && state.proposal?.id).toBe('prop-9');
    });
    const before =
      result.current.state.status === 'ready'
        ? result.current.state.inputs.weightKg
        : null;

    await act(async () => {
      result.current.dismissProposal();
    });

    expect(repo.decideProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 'prop-9', status: 'dismissed' }),
    );
    const state = result.current.state;
    if (state.status === 'ready') {
      expect(state.proposal).toBeNull();
      // The weight is untouched by a dismissal.
      expect(state.inputs.weightKg).toBe(before);
    }
  });

  it('is unavailable when no repository is configured', async () => {
    const { result } = await renderHook(() =>
      useWorkoutPlayer('sess-1', { now: NOW, repository: null }),
    );
    expect(result.current.state.status).toBe('unavailable');
  });
});
