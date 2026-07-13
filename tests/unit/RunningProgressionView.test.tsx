import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  RunningProgressionView,
  type RunningProgressionCallbacks,
} from '@/features/running/RunningProgressionView';
import type { RunningProposalView } from '@/features/running/runningProgressionRepository';
import type { RunningProgressionState } from '@/features/running/useRunningProgression';

function callbacks(
  overrides: Partial<RunningProgressionCallbacks> = {},
): RunningProgressionCallbacks {
  return {
    onAccept: jest.fn(),
    onDismiss: jest.fn(),
    onDone: jest.fn(),
    ...overrides,
  };
}

function proposal(
  overrides: Partial<RunningProposalView> = {},
): RunningProposalView {
  return {
    decision: 'advance',
    fromStageNumber: 3,
    id: 'p1',
    nextAction: 'Confirm when you are ready.',
    reasons: [{ code: 'advance-ready', message: 'You are ready to progress.' }],
    recommendation: 'You could move up to stage 4.',
    toStageNumber: 4,
    volumeWarning: null,
    ...overrides,
  };
}

function ready(
  overrides: Partial<
    Extract<RunningProgressionState, { status: 'ready' }>
  > = {},
): RunningProgressionState {
  return {
    decideError: null,
    decided: null,
    deciding: false,
    proposal: proposal(),
    status: 'ready',
    ...overrides,
  };
}

describe('RunningProgressionView', () => {
  it('renders the loading state', async () => {
    const { getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks()}
        state={{ status: 'loading' }}
      />,
    );
    expect(getByText('Checking your running progression.')).toBeTruthy();
  });

  it('renders the no-programme state', async () => {
    const { getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks()}
        state={{ status: 'no-programme' }}
      />,
    );
    expect(getByText(/do not have a run-walk programme yet/i)).toBeTruthy();
  });

  it('renders the error state', async () => {
    const { getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks()}
        state={{ message: 'Something failed.', status: 'error' }}
      />,
    );
    expect(getByText('Something failed.')).toBeTruthy();
  });

  it('offers Confirm-and-advance for an advance proposal', async () => {
    const onAccept = jest.fn();
    const { getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks({ onAccept })}
        state={ready()}
      />,
    );
    const button = getByText('Confirm and advance to stage 4');
    fireEvent.press(button);
    expect(onAccept).toHaveBeenCalled();
  });

  it('does not offer Confirm-and-advance for a repeat proposal', async () => {
    const { queryByText, getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks()}
        state={ready({
          proposal: proposal({
            decision: 'repeat',
            reasons: [
              { code: 'sessions-incomplete', message: 'Repeat this stage.' },
            ],
            toStageNumber: 3,
          }),
        })}
      />,
    );
    expect(queryByText(/Confirm and advance/i)).toBeNull();
    expect(getByText('Dismiss')).toBeTruthy();
  });

  it('shows the same-week volume note when present', async () => {
    const { getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks()}
        state={ready({
          proposal: proposal({
            volumeWarning:
              'This increases both your running and your lower-body strength in the same week.',
          }),
        })}
      />,
    );
    expect(getByText(/same week/i)).toBeTruthy();
  });

  it('confirms the decided state after accepting', async () => {
    const { getByText } = await render(
      <RunningProgressionView
        callbacks={callbacks()}
        state={ready({ decided: 'accepted' })}
      />,
    );
    expect(getByText(/confirmed you are ready to progress/i)).toBeTruthy();
  });
});
