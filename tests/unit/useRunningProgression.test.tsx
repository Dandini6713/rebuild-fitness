import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  RunningLoadResult,
  RunningProgressionRepository,
  RunningProposalView,
} from '@/features/running/runningProgressionRepository';
import { useRunningProgression } from '@/features/running/useRunningProgression';

// A signed-in user so the hook loads with an owner id.
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = new Date('2026-07-13T09:00:00.000Z');

function proposal(
  overrides: Partial<RunningProposalView> = {},
): RunningProposalView {
  return {
    decision: 'advance',
    fromStageNumber: 3,
    id: 'p1',
    nextAction: 'Confirm when you are ready.',
    reasons: [{ code: 'advance-ready', message: 'You are ready.' }],
    recommendation: 'You could move up to stage 4.',
    toStageNumber: 4,
    volumeWarning: null,
    ...overrides,
  };
}

function repository(
  overrides: Partial<RunningProgressionRepository> = {},
): RunningProgressionRepository {
  return {
    decideProposal: jest.fn<RunningProgressionRepository['decideProposal']>(
      async () => ({ ok: true }),
    ),
    loadProposal: jest.fn<RunningProgressionRepository['loadProposal']>(
      async (): Promise<RunningLoadResult> => ({
        proposal: proposal(),
        status: 'ready',
      }),
    ),
    ...overrides,
  };
}

describe('useRunningProgression', () => {
  it('loads and surfaces a proposal', async () => {
    const repo = repository();
    const { result } = await renderHook(() =>
      useRunningProgression({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    if (result.current.state.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.current.state.proposal.decision).toBe('advance');
  });

  it('reports no-programme', async () => {
    const repo = repository({
      loadProposal: jest.fn<RunningProgressionRepository['loadProposal']>(
        async () => ({ status: 'no-programme' }),
      ),
    });
    const { result } = await renderHook(() =>
      useRunningProgression({ now: NOW, repository: repo }),
    );
    await waitFor(() =>
      expect(result.current.state.status).toBe('no-programme'),
    );
  });

  it('reports the error state on a load failure', async () => {
    const repo = repository({
      loadProposal: jest.fn<RunningProgressionRepository['loadProposal']>(
        async () => ({ message: 'nope', status: 'error' }),
      ),
    });
    const { result } = await renderHook(() =>
      useRunningProgression({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });

  it('is unavailable when no repository is configured', async () => {
    const { result } = await renderHook(() =>
      useRunningProgression({ now: NOW, repository: null }),
    );
    expect(result.current.state.status).toBe('unavailable');
  });

  it('records an acceptance and reflects the decided state', async () => {
    const repo = repository();
    const { result } = await renderHook(() =>
      useRunningProgression({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.accept();
    });

    await waitFor(() => {
      const { state } = result.current;
      expect(state.status === 'ready' && state.decided).toBe('accepted');
    });
    expect(repo.decideProposal).toHaveBeenCalledWith(
      expect.objectContaining({ proposalId: 'p1', status: 'accepted' }),
    );
  });

  it('records a dismissal', async () => {
    const repo = repository();
    const { result } = await renderHook(() =>
      useRunningProgression({ now: NOW, repository: repo }),
    );
    await waitFor(() => expect(result.current.state.status).toBe('ready'));

    await act(async () => {
      result.current.dismiss();
    });

    await waitFor(() => {
      const { state } = result.current;
      expect(state.status === 'ready' && state.decided).toBe('dismissed');
    });
  });
});
