import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type { CueEvent } from '@/domain/training/cardioIntervalPlayer';
import { startClock } from '@/domain/training/cardioIntervalPlayer';
import type { CardioCueAdapter } from '@/features/cardio/cardioCueAdapter';
import type {
  CardioPlayerRepository,
  CardioReadModel,
} from '@/features/cardio/cardioPlayerRepository';
import { useCardioPlayer } from '@/features/cardio/useCardioPlayer';

// A signed-in user so the hook loads with an owner id.
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = new Date('2026-07-13T09:00:00.000Z');
const NOW_MS = NOW.getTime();

function model(overrides: Partial<CardioReadModel> = {}): CardioReadModel {
  return {
    activityKind: 'run_walk',
    cardioLogId: 'cl-1',
    cardioTemplateId: 'ct-1',
    clock: startClock(NOW_MS),
    estimatedMinutes: 27,
    scheduledSessionId: 'ss-1',
    stageNumber: 1,
    startedAt: NOW.toISOString(),
    startedFresh: true,
    templateName: 'Run-walk stage 1',
    steps: [
      {
        activityType: 'warmup',
        cueText: 'Warm up',
        durationSeconds: 300,
        order: 1,
      },
      { activityType: 'run', cueText: 'Run', durationSeconds: 60, order: 2 },
      { activityType: 'walk', cueText: 'Walk', durationSeconds: 120, order: 3 },
    ],
    ...overrides,
  };
}

function repository(
  overrides: Partial<CardioPlayerRepository> = {},
): CardioPlayerRepository {
  return {
    completeSession: jest.fn<CardioPlayerRepository['completeSession']>(
      async () => ({ success: true }),
    ),
    loadSession: jest.fn<CardioPlayerRepository['loadSession']>(async () => ({
      model: model(),
      status: 'ready',
    })),
    saveClock: jest.fn<CardioPlayerRepository['saveClock']>(
      async () => undefined,
    ),
    ...overrides,
  };
}

function recordingAdapter() {
  const cues: CueEvent[] = [];
  const adapter: CardioCueAdapter = {
    cue: (event) => cues.push(event),
    prepare: jest.fn(),
    release: jest.fn(),
  };
  return { adapter, cues };
}

async function render(repo: CardioPlayerRepository, adapter: CardioCueAdapter) {
  return renderHook(() =>
    useCardioPlayer('ss-1', {
      cueAdapter: adapter,
      now: NOW,
      repository: repo,
    }),
  );
}

describe('useCardioPlayer', () => {
  it('loads the session and exposes the current segment', async () => {
    const { adapter } = recordingAdapter();
    const { result } = await render(repository(), adapter);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    if (result.current.state.status !== 'ready') return;
    expect(result.current.state.templateName).toBe('Run-walk stage 1');
    expect(result.current.state.currentActivity).toBe('warmup');
    expect(result.current.state.segmentCount).toBe(3);
  });

  it('prepares the adapter and fires the opening cue on a fresh start', async () => {
    const { adapter, cues } = recordingAdapter();
    await render(repository(), adapter);
    await waitFor(() => expect(adapter.prepare).toHaveBeenCalled());
    await waitFor(() => expect(cues.length).toBeGreaterThan(0));
    expect(cues[0]).toMatchObject({ atSeconds: 0, kind: 'segment-start' });
  });

  it('does not replay past cues when resuming mid-session', async () => {
    const { adapter, cues } = recordingAdapter();
    // Resume: started 150s ago, not fresh. The opening cue must not re-fire.
    const resumed = model({
      clock: startClock(NOW_MS - 150_000),
      startedFresh: false,
    });
    const repo = repository({
      loadSession: jest.fn<CardioPlayerRepository['loadSession']>(async () => ({
        model: resumed,
        status: 'ready',
      })),
    });
    const { result } = await render(repo, adapter);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    // The warm-up's cue at t=0 (and 150 halfway) already passed; none replay.
    expect(cues).toHaveLength(0);
  });

  it('pauses and resumes, persisting the clock each time', async () => {
    const { adapter } = recordingAdapter();
    const repo = repository();
    const { result } = await render(repo, adapter);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.pause();
    });
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status === 'ready' && s.paused).toBe(true);
    });

    await act(async () => {
      result.current.resume();
    });
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status === 'ready' && s.paused).toBe(false);
    });

    // One save on pause, one on resume.
    expect(repo.saveClock).toHaveBeenCalledTimes(2);
  });

  it('completes the session and calls back on success', async () => {
    const { adapter } = recordingAdapter();
    const repo = repository({
      loadSession: jest.fn<CardioPlayerRepository['loadSession']>(async () => ({
        // Started 100s ago so the recorded duration is meaningful.
        model: model({
          clock: startClock(NOW_MS - 100_000),
          startedFresh: false,
        }),
        status: 'ready',
      })),
    });
    const { result } = await render(repo, adapter);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    const onComplete = jest.fn();
    await act(async () => {
      result.current.end(onComplete);
    });
    await waitFor(() => expect(onComplete).toHaveBeenCalled());
    expect(repo.completeSession).toHaveBeenCalledWith(
      expect.objectContaining({ cardioLogId: 'cl-1', durationSeconds: 100 }),
    );
  });

  it('surfaces a completion failure and does not call back', async () => {
    const { adapter } = recordingAdapter();
    const repo = repository({
      completeSession: jest.fn<CardioPlayerRepository['completeSession']>(
        async () => ({ message: 'You appear to be offline.', success: false }),
      ),
    });
    const { result } = await render(repo, adapter);
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    const onComplete = jest.fn();
    await act(async () => {
      result.current.end(onComplete);
    });
    await waitFor(() => {
      const s = result.current.state;
      expect(s.status === 'ready' && s.completeError).toMatch(/offline/i);
    });
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('reports the unavailable state when no repository is configured', async () => {
    const { adapter } = recordingAdapter();
    const { result } = await renderHook(() =>
      useCardioPlayer('ss-1', {
        cueAdapter: adapter,
        now: NOW,
        repository: null,
      }),
    );
    expect(result.current.state.status).toBe('unavailable');
  });

  it('passes through a no-programme load result', async () => {
    const { adapter } = recordingAdapter();
    const repo = repository({
      loadSession: jest.fn<CardioPlayerRepository['loadSession']>(async () => ({
        status: 'no-programme',
      })),
    });
    const { result } = await render(repo, adapter);
    await waitFor(() =>
      expect(result.current.state.status).toBe('no-programme'),
    );
  });
});
