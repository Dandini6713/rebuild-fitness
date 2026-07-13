import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render } from '@testing-library/react-native';

import {
  CardioPlayerView,
  type CardioPlayerCallbacks,
} from '@/features/cardio/CardioPlayerView';
import type {
  CardioReady,
  CardioViewState,
} from '@/features/cardio/useCardioPlayer';

function callbacks(
  overrides: Partial<CardioPlayerCallbacks> = {},
): CardioPlayerCallbacks {
  return {
    onEnd: jest.fn(),
    onExit: jest.fn(),
    onPause: jest.fn(),
    onResume: jest.fn(),
    onSetEffort: jest.fn(),
    ...overrides,
  };
}

function ready(overrides: Partial<CardioReady> = {}): CardioReady {
  return {
    activityKind: 'run_walk',
    completeError: null,
    completing: false,
    currentActivity: 'run',
    currentCue: 'Run at an easy, conversational pace',
    isComplete: false,
    nextActivity: 'walk',
    nextCue: 'Walk to recover',
    paused: false,
    segmentCount: 18,
    segmentElapsedSeconds: 20,
    segmentIndex: 1,
    segmentRemainingSeconds: 40,
    sessionEffort: null,
    stageNumber: 1,
    status: 'ready',
    templateName: 'Run-walk stage 1',
    totalElapsedSeconds: 320,
    totalRemainingSeconds: 1300,
    totalSeconds: 1620,
    ...overrides,
  };
}

async function renderView(state: CardioViewState, cbs = callbacks()) {
  return render(<CardioPlayerView callbacks={cbs} state={state} />);
}

describe('CardioPlayerView states', () => {
  it('renders loading', async () => {
    const { getByText } = await renderView({ status: 'loading' });
    expect(getByText(/loading your cardio session/i)).toBeTruthy();
  });

  it('renders not-cardio', async () => {
    const { getByText } = await renderView({ status: 'not-cardio' });
    expect(getByText(/not a cardio session/i)).toBeTruthy();
  });

  it('renders no-programme', async () => {
    const { getByText } = await renderView({ status: 'no-programme' });
    expect(getByText(/no cardio programme yet/i)).toBeTruthy();
  });

  it('renders an error', async () => {
    const { getByText } = await renderView({
      message: 'Broke',
      status: 'error',
    });
    expect(getByText('Broke')).toBeTruthy();
  });
});

describe('CardioPlayerView active', () => {
  it('shows the current interval, its countdown and the next interval', async () => {
    const { getByText, getByLabelText } = await renderView(ready());
    // The activity label sits in a StatusBadge (icon + text), so match its label.
    expect(getByLabelText(/Run, .* status/)).toBeTruthy();
    expect(getByText('Run at an easy, conversational pace')).toBeTruthy();
    // 40s remaining formats as 0:40.
    expect(getByText('0:40')).toBeTruthy();
    expect(getByText('Walk — Walk to recover')).toBeTruthy();
  });

  it('pauses when the session is running', async () => {
    const cbs = callbacks();
    const { getByLabelText } = await renderView(ready(), cbs);
    fireEvent.press(getByLabelText('Pause the session'));
    expect(cbs.onPause).toHaveBeenCalled();
  });

  it('resumes when the session is paused', async () => {
    const cbs = callbacks();
    const { getByLabelText } = await renderView(ready({ paused: true }), cbs);
    fireEvent.press(getByLabelText('Resume the session'));
    expect(cbs.onResume).toHaveBeenCalled();
  });

  it('announces the paused state', async () => {
    const { getByLabelText } = await renderView(ready({ paused: true }));
    expect(getByLabelText(/Paused, .* status/)).toBeTruthy();
  });

  it('ends the session from the controls', async () => {
    const cbs = callbacks();
    const { getByLabelText } = await renderView(ready(), cbs);
    fireEvent.press(getByLabelText('End the session now'));
    expect(cbs.onEnd).toHaveBeenCalled();
  });

  it('on completion, captures effort and finishes', async () => {
    const cbs = callbacks();
    const { getByText, getByLabelText } = await renderView(
      ready({ isComplete: true }),
      cbs,
    );
    expect(getByText('Nicely done')).toBeTruthy();
    expect(getByLabelText(/Session complete, .* status/)).toBeTruthy();
    await act(async () => {
      fireEvent.press(getByLabelText(/Effort 7 out of 10/));
    });
    expect(cbs.onSetEffort).toHaveBeenCalledWith(7);
    await act(async () => {
      fireEvent.press(getByLabelText('Finish and save the session'));
    });
    expect(cbs.onEnd).toHaveBeenCalled();
  });

  it('flags the final interval', async () => {
    const { getByText } = await renderView(
      ready({ nextActivity: null, nextCue: null }),
    );
    expect(getByText(/final interval/i)).toBeTruthy();
  });
});
