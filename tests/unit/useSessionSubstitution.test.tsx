import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import { useSessionSubstitution } from '@/features/readiness/useSessionSubstitution';
import type {
  SubstitutionRepository,
  SubstitutionRequest,
} from '@/features/readiness/substitutionRepository';

// A signed-in user so the swap has an owner (the RPC captures auth.uid()).
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

function repository(
  substitute: SubstitutionRepository['substitute'],
): SubstitutionRepository {
  return { substitute };
}

describe('useSessionSubstitution — the amber swap', () => {
  it('resolves the chosen activity to the right request and surfaces the new session', async () => {
    const calls: SubstitutionRequest[] = [];
    const repo = repository(async (req) => {
      calls.push(req);
      return { newSessionId: 'new-9', status: 'substituted' };
    });

    const { result } = await renderHook(() =>
      useSessionSubstitution({
        repository: repo,
        scheduledSessionId: 'session-1',
      }),
    );

    await act(async () => {
      result.current.substitute('bike');
    });
    await waitFor(() =>
      expect(result.current.state.status).toBe('substituted'),
    );

    // Easy cycling → a cardio replacement, the specific activity kept in the reason,
    // the next-morning check recorded, and the original session id carried through.
    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      expectNextMorningCheck: true,
      newTemplateId: null,
      newType: 'cardio',
      originalSessionId: 'session-1',
      reason:
        'Amber readiness result — replaced with easy cycling. The running week does not progress.',
    });
    if (result.current.state.status !== 'substituted') {
      return;
    }
    expect(result.current.state.newSessionId).toBe('new-9');
  });

  it('records a rest swap as a rest-typed replacement', async () => {
    const calls: SubstitutionRequest[] = [];
    const repo = repository(async (req) => {
      calls.push(req);
      return { newSessionId: 'new-10', status: 'substituted' };
    });
    const { result } = await renderHook(() =>
      useSessionSubstitution({
        repository: repo,
        scheduledSessionId: 'session-2',
      }),
    );

    await act(async () => {
      result.current.substitute('rest');
    });
    await waitFor(() =>
      expect(result.current.state.status).toBe('substituted'),
    );
    expect(calls[0]?.newType).toBe('rest');
  });

  it('reports an honest offline failure, then can be reset and retried', async () => {
    const repo = repository(async () => ({ status: 'offline' }));
    const { result } = await renderHook(() =>
      useSessionSubstitution({
        repository: repo,
        scheduledSessionId: 'session-1',
      }),
    );

    await act(async () => {
      result.current.substitute('walk');
    });
    await waitFor(() => expect(result.current.state.status).toBe('offline'));

    await act(async () => {
      result.current.reset();
    });
    await waitFor(() => expect(result.current.state.status).toBe('idle'));
  });

  it('surfaces a server error message', async () => {
    const repo = repository(async () => ({
      message: 'only a planned session can be substituted',
      status: 'error',
    }));
    const { result } = await renderHook(() =>
      useSessionSubstitution({
        repository: repo,
        scheduledSessionId: 'session-1',
      }),
    );
    await act(async () => {
      result.current.substitute('walk');
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status !== 'error') {
      return;
    }
    expect(result.current.state.message).toContain('planned session');
  });

  it('is unavailable when there is no session to swap', async () => {
    const repo = repository(async () => ({
      newSessionId: 'x',
      status: 'substituted',
    }));
    const { result } = await renderHook(() =>
      useSessionSubstitution({ repository: repo, scheduledSessionId: null }),
    );
    await act(async () => {
      result.current.substitute('walk');
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });
});
