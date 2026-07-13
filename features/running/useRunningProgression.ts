// Drives the running progression surface (roadmap 17, docs/06 §6.3): on demand it
// evaluates the user's current run-walk stage from their completed sessions and
// readiness responses, surfaces the newest 'proposed' proposal, and records the
// user's explicit Confirm-and-advance / Not-now decision. The rules live in the pure
// engine (domain/training/runningProgression.ts); this hook only wires state and the
// repository, and the view renders what it returns.
//
// Nothing here diagnoses or assesses anything (docs/07): a proposal is a training
// suggestion the user confirms or sets aside; it is never applied automatically, and
// accepting an advance records the decision without moving the schedule (a declared
// seam — see the repository and CLAUDE.md).

import { useCallback, useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultRunningProgressionRepository } from './defaultRunningProgressionRepository';
import type {
  RunningProgressionRepository,
  RunningProposalView,
} from './runningProgressionRepository';

export type RunningReady = {
  status: 'ready';
  proposal: RunningProposalView;
  deciding: boolean;
  decided: 'accepted' | 'dismissed' | null;
  decideError: string | null;
};

export type RunningProgressionState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'no-programme' }
  | { status: 'error'; message: string }
  | RunningReady;

export type UseRunningProgressionValue = {
  state: RunningProgressionState;
  accept: () => void;
  dismiss: () => void;
  reload: () => void;
};

const DECIDE_ERROR =
  'We could not save your decision. Check your connection and try again.';

export function useRunningProgression(
  options: {
    now?: Date;
    repository?: RunningProgressionRepository | null;
  } = {},
): UseRunningProgressionValue {
  const repository =
    options.repository === undefined
      ? defaultRunningProgressionRepository
      : options.repository;

  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const nowIso = (options.now ?? undefined)?.toISOString();

  const [proposal, setProposal] = useState<RunningProposalView | null>(null);
  const [loadState, setLoadState] = useState<
    'loading' | 'no-programme' | 'error'
  >('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [decided, setDecided] = useState<'accepted' | 'dismissed' | null>(null);
  const [decideError, setDecideError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  const reload = useCallback(() => {
    setProposal(null);
    setLoadState('loading');
    setLoadError(null);
    setDecided(null);
    setDecideError(null);
    setReloadKey((key) => key + 1);
  }, []);

  useEffect(() => {
    if (repository === null || !userId) {
      return;
    }
    let active = true;
    void repository
      .loadProposal({
        nowIso: nowIso ?? new Date().toISOString(),
        userId,
      })
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.status === 'ready') {
          setProposal(result.proposal);
        } else if (result.status === 'error') {
          setLoadError(result.message);
          setLoadState('error');
        } else {
          setLoadState('no-programme');
        }
      });
    return () => {
      active = false;
    };
  }, [nowIso, reloadKey, repository, userId]);

  const decide = useCallback(
    (status: 'accepted' | 'dismissed') => {
      if (repository === null || !userId || !proposal || deciding || decided) {
        return;
      }
      setDeciding(true);
      setDecideError(null);
      void repository
        .decideProposal({
          decidedAtIso: (nowIso ? new Date(nowIso) : new Date()).toISOString(),
          proposalId: proposal.id,
          status,
          userId,
        })
        .then((result) => {
          setDeciding(false);
          if (result.ok) {
            setDecided(status);
          } else {
            setDecideError(DECIDE_ERROR);
          }
        });
    },
    [decided, deciding, nowIso, proposal, repository, userId],
  );

  const accept = useCallback(() => decide('accepted'), [decide]);
  const dismiss = useCallback(() => decide('dismissed'), [decide]);

  let state: RunningProgressionState;
  if (repository === null) {
    state = { status: 'unavailable' };
  } else if (!proposal) {
    if (loadState === 'error') {
      state = {
        message: loadError ?? 'Something went wrong.',
        status: 'error',
      };
    } else if (loadState === 'no-programme') {
      state = { status: 'no-programme' };
    } else {
      state = { status: 'loading' };
    }
  } else {
    state = {
      decideError,
      decided,
      deciding,
      proposal,
      status: 'ready',
    };
  }

  return { accept, dismiss, reload, state };
}
