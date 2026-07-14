import { act, renderHook, waitFor } from '@testing-library/react-native';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';

import type { AccountRepository } from '@/features/account/accountRepository';
import { useAccountDeletion } from '@/features/account/useAccountData';

const mockSignIn =
  jest.fn<(email: string, password: string) => Promise<{ success: boolean }>>();
const mockSignOut = jest.fn(async () => ({ success: true as const }));

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({
    session: { user: { email: 'me@example.com', id: 'user-1' } },
    signIn: mockSignIn,
    signOut: mockSignOut,
  }),
}));

function repository(
  deleteImpl: () => Promise<{ status: string }> = async () => ({
    status: 'deleted',
  }),
): AccountRepository {
  return {
    clearOwnStorage: jest.fn(async () => undefined),
    deleteAccount: jest.fn(deleteImpl),
    exportData: jest.fn(),
  } as unknown as AccountRepository;
}

beforeEach(() => {
  mockSignIn.mockReset();
  mockSignIn.mockResolvedValue({ success: true });
  mockSignOut.mockClear();
});

describe('useAccountDeletion — the recent-authentication gate', () => {
  it('does not delete when re-authentication fails, and keeps the flow open with an error', async () => {
    mockSignIn.mockResolvedValue({ success: false });
    const repo = repository();
    const { result } = await renderHook(() =>
      useAccountDeletion({ repository: repo }),
    );

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirm('wrong-password');
    });

    await waitFor(() => {
      expect(
        result.current.deletionState.status === 'confirming' &&
          result.current.deletionState.error,
      ).toBeTruthy();
    });
    // The load-bearing assertion: a failed fresh sign-in deletes NOTHING.
    expect(repo.deleteAccount).not.toHaveBeenCalled();
    expect(mockSignOut).not.toHaveBeenCalled();
  });

  it('deletes only after a successful re-authentication, then signs out', async () => {
    mockSignIn.mockResolvedValue({ success: true });
    const repo = repository();
    const { result } = await renderHook(() =>
      useAccountDeletion({ repository: repo }),
    );

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirm('correct-password');
    });

    await waitFor(() => {
      expect(result.current.deletionState.status).toBe('deleted');
    });
    expect(mockSignIn).toHaveBeenCalledWith(
      'me@example.com',
      'correct-password',
    );
    expect(repo.deleteAccount).toHaveBeenCalledWith('user-1');
    expect(mockSignOut).toHaveBeenCalled();
  });

  it('requires a password before attempting anything', async () => {
    const repo = repository();
    const { result } = await renderHook(() =>
      useAccountDeletion({ repository: repo }),
    );

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirm('   ');
    });

    expect(mockSignIn).not.toHaveBeenCalled();
    expect(repo.deleteAccount).not.toHaveBeenCalled();
    expect(
      result.current.deletionState.status === 'confirming' &&
        result.current.deletionState.error,
    ).toBeTruthy();
  });

  it('reports an offline deletion honestly without signing out', async () => {
    mockSignIn.mockResolvedValue({ success: true });
    const repo = repository(async () => ({ status: 'offline' }));
    const { result } = await renderHook(() =>
      useAccountDeletion({ repository: repo }),
    );

    await act(async () => {
      result.current.start();
    });
    await act(async () => {
      result.current.confirm('correct-password');
    });

    await waitFor(() => {
      expect(
        result.current.deletionState.status === 'confirming' &&
          result.current.deletionState.busy === false,
      ).toBe(true);
    });
    expect(mockSignOut).not.toHaveBeenCalled();
  });
});

describe('useAccountDeletion — flow control', () => {
  it('starts idle, opens the confirmation, and cancels back to idle', async () => {
    const { result } = await renderHook(() =>
      useAccountDeletion({ repository: repository() }),
    );
    expect(result.current.deletionState.status).toBe('idle');

    await act(async () => {
      result.current.start();
    });
    expect(result.current.deletionState.status).toBe('confirming');

    await act(async () => {
      result.current.cancel();
    });
    expect(result.current.deletionState.status).toBe('idle');
  });

  it('is unavailable when there is no repository', async () => {
    const { result } = await renderHook(() =>
      useAccountDeletion({ repository: null }),
    );
    await act(async () => {
      result.current.start();
    });
    expect(result.current.deletionState.status).toBe('unavailable');
  });
});
