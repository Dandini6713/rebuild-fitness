// Drives the S-053 data export and account deletion surface (roadmap 25, docs/03 S-053,
// docs/07 §7.7/§7.8). Two focused hooks, one per action, sharing the account repository.
//
// The export hook prepares the versioned JSON; the screen shares/saves it. The deletion hook
// enforces the docs/07 §7.8 RECENT-AUTHENTICATION gate: the destructive delete proceeds ONLY
// after a fresh re-authentication (the user re-enters their password, routed through
// authService.signInWithPassword via AuthProvider.signIn) in the same flow. A failed
// re-authentication aborts and deletes nothing. Deletion is multi-step and cancellable right
// up to the final confirm — there is no accidental single-tap delete.

import { useCallback, useState } from 'react';

import {
  accountExportFilename,
  serialiseAccountExport,
} from '@/domain/account/accountExport';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultAccountRepository } from './defaultAccountRepository';
import type { AccountRepository } from './accountRepository';

// ---- Export ----------------------------------------------------------------

export type AccountExportState =
  | { status: 'idle' }
  | { status: 'unavailable' }
  | { status: 'generating' }
  | { status: 'ready'; json: string; filename: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const EXPORT_ERROR =
  'We could not prepare your export. Check your connection and try again.';

export type UseAccountExportOptions = {
  repository?: AccountRepository | null;
  now?: Date;
};

export function useAccountExport(options: UseAccountExportOptions = {}) {
  const repository =
    options.repository === undefined
      ? defaultAccountRepository
      : options.repository;
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [state, setState] = useState<AccountExportState>({ status: 'idle' });

  const generate = useCallback(() => {
    if (!repository || !userId) {
      setState({ status: 'unavailable' });
      return;
    }
    setState({ status: 'generating' });
    const exportedAtIso = (options.now ?? new Date()).toISOString();
    void repository.exportData(userId, exportedAtIso).then((result) => {
      if (result.status === 'ready') {
        setState({
          filename: accountExportFilename(result.export),
          json: serialiseAccountExport(result.export),
          status: 'ready',
        });
      } else if (result.status === 'offline') {
        setState({ status: 'offline' });
      } else {
        setState({ message: result.message || EXPORT_ERROR, status: 'error' });
      }
    });
  }, [options.now, repository, userId]);

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { exportState: state, generate, reset } as const;
}

// ---- Deletion --------------------------------------------------------------

export type AccountDeletionState =
  | { status: 'idle' }
  | { status: 'unavailable' }
  // The confirmation is on screen. `busy` covers the re-auth + delete round trip; `error`
  // carries a failed re-authentication or a failed delete, keeping the flow open to retry.
  | { status: 'confirming'; error: string | null; busy: boolean }
  | { status: 'deleted' };

const REAUTH_FAILED =
  'That password was not correct, so your account has not been deleted. Please try again.';
const NO_EMAIL =
  'We could not confirm your identity on this device, so nothing has been deleted.';
const DELETE_OFFLINE =
  'You appear to be offline, so nothing has been deleted. Reconnect and try again.';
const DELETE_ERROR =
  'We could not delete your account. Nothing has been deleted — please try again.';
const NEEDS_PASSWORD = 'Enter your password to confirm.';

export type UseAccountDeletionOptions = {
  repository?: AccountRepository | null;
};

export function useAccountDeletion(options: UseAccountDeletionOptions = {}) {
  const repository =
    options.repository === undefined
      ? defaultAccountRepository
      : options.repository;
  const { session, signIn, signOut } = useAuth();
  const userId = session?.user.id ?? null;
  const email = session?.user.email ?? null;

  const [state, setState] = useState<AccountDeletionState>({ status: 'idle' });

  const start = useCallback(() => {
    if (!repository || !userId) {
      setState({ status: 'unavailable' });
      return;
    }
    setState({ busy: false, error: null, status: 'confirming' });
  }, [repository, userId]);

  const cancel = useCallback(() => {
    setState((current) =>
      current.status === 'confirming' && current.busy
        ? current
        : { status: 'idle' },
    );
  }, []);

  // The final, deliberate confirm: re-authenticate, then delete, then sign out. The order is
  // load-bearing — a fresh sign-in must succeed BEFORE anything is removed (docs/07 §7.8), and
  // any failure leaves the account fully intact.
  const confirm = useCallback(
    (password: string) => {
      if (!repository || !userId) {
        setState({ status: 'unavailable' });
        return;
      }
      if (state.status !== 'confirming' || state.busy) {
        return;
      }
      if (!password.trim()) {
        setState({ busy: false, error: NEEDS_PASSWORD, status: 'confirming' });
        return;
      }
      if (!email) {
        setState({ busy: false, error: NO_EMAIL, status: 'confirming' });
        return;
      }

      setState({ busy: true, error: null, status: 'confirming' });
      void (async () => {
        // Fresh re-authentication (docs/07 §7.8). Deletes nothing on failure.
        const auth = await signIn(email, password);
        if (!auth.success) {
          setState({ busy: false, error: REAUTH_FAILED, status: 'confirming' });
          return;
        }

        const result = await repository.deleteAccount(userId);
        if (result.status === 'deleted') {
          // Clear the local session; the app routes back to sign-in on its own.
          await signOut();
          setState({ status: 'deleted' });
          return;
        }
        setState({
          busy: false,
          error:
            result.status === 'offline'
              ? DELETE_OFFLINE
              : result.message || DELETE_ERROR,
          status: 'confirming',
        });
      })();
    },
    [email, repository, signIn, signOut, state, userId],
  );

  return { cancel, confirm, deletionState: state, start } as const;
}
