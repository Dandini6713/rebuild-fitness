import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import type { PlayerExerciseView } from '@/features/workouts/workoutPlayerRepository';
import type {
  PlayerReady,
  PlayerViewState,
} from '@/features/workouts/useWorkoutPlayer';
import {
  WorkoutPlayerView,
  type WorkoutPlayerCallbacks,
} from '@/features/workouts/WorkoutPlayerView';

const exercise = (
  overrides: Partial<PlayerExerciseView> = {},
): PlayerExerciseView => ({
  exerciseId: 'ex-1',
  name: 'Leg press',
  order: 1,
  previous: { performedAt: '2026-07-05', repetitions: 10, weightKg: 22.5 },
  proposal: null,
  repMax: 12,
  repMin: 8,
  restSeconds: 90,
  slug: 'leg-press',
  targetSets: 2,
  templateExerciseId: 'te-1',
  ...overrides,
});

const ready = (overrides: Partial<PlayerReady> = {}): PlayerReady => ({
  completedCount: 0,
  elapsedSeconds: 185,
  ending: false,
  endError: null,
  decidingProposal: false,
  exercise: exercise(),
  exerciseCount: 6,
  exerciseNumber: 1,
  inputs: {
    discomfortScore: 0,
    effortScore: null,
    repetitions: 10,
    techniqueControlled: true,
    weightKg: 20,
  },
  isComplete: false,
  lastSetSynced: null,
  logging: false,
  proposal: null,
  rest: { active: false, remainingSeconds: 0 },
  setsDone: 0,
  setsForExercise: [],
  setsTarget: 2,
  status: 'ready',
  workoutName: 'Strength A',
  ...overrides,
});

function callbacks(
  overrides: Partial<WorkoutPlayerCallbacks> = {},
): WorkoutPlayerCallbacks {
  return {
    onAcceptProposal: jest.fn(),
    onAdjustReps: jest.fn(),
    onAdjustWeight: jest.fn(),
    onDismissProposal: jest.fn(),
    onEnd: jest.fn(),
    onExit: jest.fn(),
    onLogSet: jest.fn(),
    onNextExercise: jest.fn(),
    onOpenGuide: jest.fn(),
    onPreviousExercise: jest.fn(),
    onSetDiscomfort: jest.fn(),
    onSetEffort: jest.fn(),
    onSetTechniqueControlled: jest.fn(),
    onSkipRest: jest.fn(),
    ...overrides,
  };
}

async function renderView(
  state: PlayerViewState,
  cb: WorkoutPlayerCallbacks = callbacks(),
) {
  return render(<WorkoutPlayerView callbacks={cb} state={state} />);
}

describe('WorkoutPlayerView — shell states', () => {
  it('shows a loading state', async () => {
    const view = await renderView({ status: 'loading' });
    expect(view.getByLabelText('Loading session')).toBeOnTheScreen();
  });

  it('explains a non-strength session honestly', async () => {
    const view = await renderView({ status: 'not-strength' });
    expect(view.getByText('Not a strength session')).toBeOnTheScreen();
  });

  it('shows the error state on failure', async () => {
    const view = await renderView({
      message: 'Check your connection.',
      status: 'error',
    });
    expect(view.getByText('Check your connection.')).toBeOnTheScreen();
  });
});

describe('WorkoutPlayerView — the exercise card', () => {
  it('shows the workout name, exercise number and elapsed time', async () => {
    const view = await renderView(ready());
    expect(view.getByText('Strength A')).toBeOnTheScreen();
    expect(view.getByText('Exercise 1 of 6 · 3:05 elapsed')).toBeOnTheScreen();
  });

  it('shows the target and the previous result', async () => {
    const view = await renderView(ready());
    expect(view.getByText('2 sets × 8–12 reps')).toBeOnTheScreen();
    expect(view.getByText('Last time: 22.5 kg × 10 reps')).toBeOnTheScreen();
  });

  it('is honest about a genuine first time', async () => {
    const view = await renderView(
      ready({ exercise: exercise({ previous: null }) }),
    );
    expect(
      view.getByText(/first time logging this exercise/),
    ).toBeOnTheScreen();
  });

  it('records a set through the primary action', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Log set 1 for Leg press'));
    });
    expect(cb.onLogSet).toHaveBeenCalled();
  });

  it('steps the weight up with an accessible label', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Increase weight by 2.5 kilograms'));
    });
    expect(cb.onAdjustWeight).toHaveBeenCalledWith(2.5);
  });

  it('offers effort and discomfort scales with accessible options', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Effort 8 out of 10'));
    });
    expect(cb.onSetEffort).toHaveBeenCalledWith(8);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Discomfort 3 out of 10'));
    });
    expect(cb.onSetDiscomfort).toHaveBeenCalledWith(3);
  });

  it('captures whether technique felt controlled', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Technique not controlled'));
    });
    expect(cb.onSetTechniqueControlled).toHaveBeenCalledWith(false);
  });

  it('links each exercise to its guide', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('How to do Leg press'));
    });
    expect(cb.onOpenGuide).toHaveBeenCalledWith('leg-press');
  });

  it('labels the illustration placeholder rather than faking media', async () => {
    const view = await renderView(ready());
    expect(
      view.getByText('Illustration and video arrive in a later update'),
    ).toBeOnTheScreen();
  });

  it('notes when a set is saved locally but not yet synced', async () => {
    const view = await renderView(ready({ lastSetSynced: false }));
    expect(
      view.getByText(
        /Saved on your device. It will sync when you are back online./,
      ),
    ).toBeOnTheScreen();
  });
});

describe('WorkoutPlayerView — discomfort and replace', () => {
  it('offers conservative options without diagnosing', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Something feels uncomfortable'));
    });
    expect(
      view.getByText(/does not assess or diagnose your tendon or any injury/),
    ).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(
        view.getByLabelText('Reduce the weight by 2.5 kilograms'),
      );
    });
    expect(cb.onAdjustWeight).toHaveBeenCalledWith(-2.5);
  });

  it('presents replace as a clearly-marked seam that points to alternatives', async () => {
    const cb = callbacks();
    const view = await renderView(ready(), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Replace Leg press'));
    });
    expect(view.getByText(/activity substitution update/)).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(
        view.getByLabelText('View approved alternatives for Leg press'),
      );
    });
    expect(cb.onOpenGuide).toHaveBeenCalledWith('leg-press');
  });
});

describe('WorkoutPlayerView — progression proposal', () => {
  const increaseProposal = {
    currentWeightKg: 40,
    decision: 'increase' as const,
    id: 'prop-1',
    proposedWeightKg: 42.5,
    reasons: [
      { code: 'increase-ready', message: 'Every set reached the top.' },
    ],
  };

  it('shows an increase suggestion with its weight and reasons, and accepts it', async () => {
    const cb = callbacks();
    const view = await renderView(ready({ proposal: increaseProposal }), cb);
    expect(view.getByText('A weight increase is suggested')).toBeOnTheScreen();
    expect(
      view.getByText('Suggested weight: 42.5 kg (from 40 kg).'),
    ).toBeOnTheScreen();
    expect(view.getByText('Every set reached the top.')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(
        view.getByLabelText('Accept the suggestion and use 42.5 kg'),
      );
    });
    expect(cb.onAcceptProposal).toHaveBeenCalled();
  });

  it('lets the user dismiss a suggestion with "Not now"', async () => {
    const cb = callbacks();
    const view = await renderView(ready({ proposal: increaseProposal }), cb);
    await act(async () => {
      fireEvent.press(view.getByLabelText('Not now'));
    });
    expect(cb.onDismissProposal).toHaveBeenCalled();
  });

  it('shows no proposal card when there is none', async () => {
    const view = await renderView(ready({ proposal: null }));
    expect(view.queryByText(/suggestion/i)).toBeNull();
  });
});

describe('WorkoutPlayerView — finishing', () => {
  it('shows a finish card once every set is recorded', async () => {
    const cb = callbacks();
    const view = await renderView(ready({ isComplete: true }), cb);
    expect(view.getByText('Nicely done')).toBeOnTheScreen();
    await act(async () => {
      fireEvent.press(view.getByLabelText('Finish and save this session'));
    });
    expect(cb.onEnd).toHaveBeenCalled();
  });

  it('shows a rest timer while resting', async () => {
    const view = await renderView(
      ready({ rest: { active: true, remainingSeconds: 62 } }),
    );
    expect(view.getByText('1:02')).toBeOnTheScreen();
  });
});
