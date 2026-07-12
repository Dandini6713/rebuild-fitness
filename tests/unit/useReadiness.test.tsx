import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { useReadiness } from '@/features/readiness/useReadiness';
import type {
  ReadinessRepository,
  ReadinessSubmission,
} from '@/features/readiness/readinessRepository';
import { createMemoryHeldReadinessStore } from '@/lib/persistence/heldReadinessStore';
import type { ReadinessAnswers } from '@/features/readiness/readinessSchema';

// A signed-in user so submissions carry an owner.
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const answers: ReadinessAnswers = {
  confidenceScore: 5,
  painScore: 1,
  stiffnessChange: 'same',
  suddenChange: false,
  swellingLevel: 'none',
  walkingStatus: 'normal',
};

function repository(
  submit: ReadinessRepository['submit'],
): ReadinessRepository {
  return { submit };
}

describe('useReadiness — trusted submission', () => {
  it('sends raw answers only and surfaces the server classification', async () => {
    const calls: ReadinessSubmission[] = [];
    const repo = repository(async (submission) => {
      calls.push(submission);
      return {
        result: {
          classification: 'green',
          id: 'chk-1',
          reasons: [{ code: 'all-clear', message: 'ok' }],
          ruleVersion: 'readiness/v1',
        },
        status: 'classified',
      };
    });
    const store = createMemoryHeldReadinessStore();

    const { result } = await renderHook(() =>
      useReadiness('pre_session', { repository: repo, store }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('form'));

    await act(async () => {
      result.current.submit(answers, null);
    });

    await waitFor(() => {
      expect(result.current.state.status).toBe('classified');
    });

    // The client passed the raw answers and never a classification.
    expect(calls).toHaveLength(1);
    const submission = calls[0] as unknown as Record<string, unknown>;
    expect(submission.painScore).toBe(1);
    expect(submission.checkinType).toBe('pre_session');
    expect(submission).not.toHaveProperty('classification');

    if (result.current.state.status !== 'classified') {
      return;
    }
    expect(result.current.state.result.classification).toBe('green');
  });

  it('holds the answers on the device when offline, then replays on retry', async () => {
    const store = createMemoryHeldReadinessStore();
    let online = false;
    const repo = repository(async (submission) => {
      if (!online) {
        // Mirror the repository's offline branch (a network failure yields a hold).
        return {
          provisional: {
            allowedAction: '',
            classifiable: true,
            classification: 'green',
            inputs: {
              cannotBearWeight: false,
              confidenceScore: submission.confidenceScore,
              painScore: submission.painScore,
              previousNextMorningIncrease: false,
              stiffnessChange: 'same',
              suddenChange: false,
              swellingLevel: 'none',
              walkingStatus: 'normal',
            },
            missingInputs: [],
            nextAction: '',
            reasons: [],
            recommendation: '',
            ruleVersion: 'readiness/v1',
          },
          status: 'held',
        };
      }
      return {
        result: {
          classification: 'green',
          id: 'chk-2',
          reasons: [],
          ruleVersion: 'readiness/v1',
        },
        status: 'classified',
      };
    });

    const { result } = await renderHook(() =>
      useReadiness('pre_session', { repository: repo, store }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('form'));

    await act(async () => {
      result.current.submit(answers, null);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('held');
    });

    // The answers are safe on the device for replay.
    expect(await store.load()).not.toBeNull();

    // Connection returns; a retry replays the held submission and clears it.
    online = true;
    await act(async () => {
      result.current.retryHeld();
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('classified');
    });
    await waitFor(async () => {
      expect(await store.load()).toBeNull();
    });
  });

  it('never submits a classification even for red-looking answers', async () => {
    const calls: ReadinessSubmission[] = [];
    const repo = repository(async (submission) => {
      calls.push(submission);
      return {
        result: {
          classification: 'red',
          id: 'chk-3',
          reasons: [{ code: 'high-pain', message: 'high pain' }],
          ruleVersion: 'readiness/v1',
        },
        status: 'classified',
      };
    });
    const store = createMemoryHeldReadinessStore();
    const { result } = await renderHook(() =>
      useReadiness('pre_session', { repository: repo, store }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('form'));

    await act(async () => {
      result.current.submit({ ...answers, painScore: 9 }, null);
    });
    await waitFor(() => {
      expect(result.current.state.status).toBe('classified');
    });

    const keys = Object.keys(calls[0] as object);
    expect(keys).not.toContain('classification');
  });
});
