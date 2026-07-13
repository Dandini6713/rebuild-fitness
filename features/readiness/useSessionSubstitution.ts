// Drives the amber activity substitution (roadmap 15, docs/06 §6.2). It takes the
// user's chosen gentler activity, resolves it to the session_type and reason through
// the pure activitySubstitution module, and calls the trusted substitute_session RPC
// through the repository. The linked-replacement logic and the atomicity live in the
// RPC; this hook only wires the request, the in-flight state and the result.
//
// The amber swap always records that a next-morning check is expected (docs/06 §6.2);
// the reminder that surfaces it is a later roadmap item (roadmap 24). Offline is an
// honest failure (the write is server-side), never a pretend success.

import { useCallback, useState } from 'react';

import {
  resolveSubstitution,
  type SubstitutionActivity,
} from '@/domain/training/activitySubstitution';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultSubstitutionRepository } from './defaultSubstitutionRepository';
import type { SubstitutionRepository } from './substitutionRepository';

export type SessionSubstitutionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'substituted'; newSessionId: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type UseSessionSubstitutionOptions = {
  scheduledSessionId: string | null;
  repository?: SubstitutionRepository | null;
};

export type UseSessionSubstitutionValue = {
  state: SessionSubstitutionState;
  substitute: (activity: SubstitutionActivity) => void;
  reset: () => void;
};

const UNAVAILABLE =
  'Swapping the session is not available right now. Please try again later.';

export function useSessionSubstitution(
  options: UseSessionSubstitutionOptions,
): UseSessionSubstitutionValue {
  const { session } = useAuth();
  const repository =
    options.repository === undefined
      ? defaultSubstitutionRepository
      : options.repository;

  const [state, setState] = useState<SessionSubstitutionState>({
    status: 'idle',
  });

  const substitute = useCallback(
    (activity: SubstitutionActivity) => {
      if (!repository || !session || !options.scheduledSessionId) {
        setState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      const { newType, reason } = resolveSubstitution(activity);
      setState({ status: 'submitting' });
      void repository
        .substitute({
          expectNextMorningCheck: true,
          newTemplateId: null,
          newType,
          originalSessionId: options.scheduledSessionId,
          reason,
        })
        .then((result) => {
          if (result.status === 'substituted') {
            setState({
              newSessionId: result.newSessionId,
              status: 'substituted',
            });
            return;
          }
          if (result.status === 'offline') {
            setState({ status: 'offline' });
            return;
          }
          setState({ message: result.message, status: 'error' });
        });
    },
    [options.scheduledSessionId, repository, session],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { reset, state, substitute };
}
