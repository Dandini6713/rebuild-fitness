// Drives the readiness forms (docs/03 S-011/S-015): it takes already-validated raw
// answers from the view, submits them through the trusted RPC, and exposes the
// server's classification for the acknowledgement. The classification rules live in
// the pure domain module and the SQL port; this hook only wires submission, the
// offline hold and the result state.
//
// The client sends RAW ANSWERS ONLY (docs/06 §6.1). This hook never constructs or
// sends a classification — the ServerReadinessResult it surfaces comes back from the
// server. Offline, the answers are held on the device and replayed on reconnect
// rather than lost (docs/04 §4.4/§4.5), and a clearly-labelled provisional result
// from the same pure rules is shown so a red flag is never hidden.
//
// Nothing here diagnoses or assesses the injury (docs/07): the recommendation copy is
// conservative activity guidance, and a red result points to professional care.

import { useCallback, useEffect, useRef, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';
import {
  createHeldReadinessStore,
  type HeldReadinessStore,
} from '@/lib/persistence/heldReadinessStore';

import { defaultReadinessRepository } from './defaultReadinessRepository';
import type {
  ReadinessRepository,
  ReadinessSubmission,
  ServerReadinessResult,
  SubmitResult,
} from './readinessRepository';
import type {
  CheckinType,
  PostSessionExtras,
  ReadinessAnswers,
} from './readinessSchema';
import type { ReadinessDecision } from '@/domain/training/readinessClassification';

export type ReadinessResultState =
  | { status: 'form' }
  | { status: 'submitting' }
  | {
      status: 'classified';
      result: ServerReadinessResult;
      scheduleNextMorning: boolean;
    }
  // Offline: the answers are saved on the device and will be submitted when back
  // online. The provisional decision is display-only and not stored.
  | { status: 'held'; provisional: ReadinessDecision }
  | { status: 'error'; message: string };

export type UseReadinessOptions = {
  scheduledSessionId?: string | null;
  repository?: ReadinessRepository | null;
  store?: HeldReadinessStore;
  now?: () => Date;
};

export type UseReadinessValue = {
  state: ReadinessResultState;
  submit: (answers: ReadinessAnswers, extras: PostSessionExtras | null) => void;
  retryHeld: () => void;
  reset: () => void;
};

const UNAVAILABLE =
  'Readiness checks are not available right now. Please try again later.';

export function useReadiness(
  checkinType: CheckinType,
  options: UseReadinessOptions = {},
): UseReadinessValue {
  const { session } = useAuth();
  const repository =
    options.repository === undefined
      ? defaultReadinessRepository
      : options.repository;
  // One store instance for the lifetime of the mount.
  const storeRef = useRef<HeldReadinessStore>(
    options.store ?? createHeldReadinessStore(),
  );
  // Stable for the lifetime of the mount so it never re-triggers the callbacks.
  const nowRef = useRef<() => Date>(options.now ?? (() => new Date()));

  const [state, setState] = useState<ReadinessResultState>({ status: 'form' });

  const buildSubmission = useCallback(
    (
      answers: ReadinessAnswers,
      extras: PostSessionExtras | null,
    ): ReadinessSubmission => ({
      // Optional context seams stay off until a source exists (documented in the
      // classifier). No UI collects them yet, so they default to false = unknown.
      cannotBearWeight: false,
      checkinType,
      confidenceScore: answers.confidenceScore,
      notes: extras?.notes?.trim() ? extras.notes.trim() : null,
      painScore: answers.painScore,
      previousNextMorningIncrease: false,
      scheduledSessionId: options.scheduledSessionId ?? null,
      sessionEffort: extras?.sessionEffort ?? null,
      stiffnessChange: answers.stiffnessChange,
      suddenChange: answers.suddenChange,
      swellingLevel: answers.swellingLevel,
      walkingStatus: answers.walkingStatus,
    }),
    [checkinType, options.scheduledSessionId],
  );

  const applyResult = useCallback(
    (result: SubmitResult, scheduleNextMorning: boolean) => {
      if (result.status === 'classified') {
        setState({
          result: result.result,
          scheduleNextMorning,
          status: 'classified',
        });
        void storeRef.current.clear();
        return;
      }
      if (result.status === 'held') {
        setState({ provisional: result.provisional, status: 'held' });
        return;
      }
      setState({ message: result.message, status: 'error' });
    },
    [],
  );

  const submit = useCallback(
    (answers: ReadinessAnswers, extras: PostSessionExtras | null) => {
      if (!repository || !session) {
        setState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      const submission = buildSubmission(answers, extras);
      const scheduleNextMorning = extras?.scheduleNextMorning === true;
      setState({ status: 'submitting' });
      void repository.submit(submission).then((result) => {
        if (result.status === 'held') {
          void storeRef.current.save({
            ...submission,
            capturedAtIso: nowRef.current().toISOString(),
          });
        }
        applyResult(result, scheduleNextMorning);
      });
    },
    [applyResult, buildSubmission, repository, session],
  );

  // Replay a held submission (called on mount and by the screen on reconnect). If
  // there is nothing held, or no repository/session, it is a no-op.
  const retryHeld = useCallback(() => {
    if (!repository || !session) {
      return;
    }
    void storeRef.current.load().then((held) => {
      if (!held) {
        return;
      }
      void repository
        .submit({
          cannotBearWeight: held.cannotBearWeight,
          checkinType: held.checkinType,
          confidenceScore: held.confidenceScore,
          notes: held.notes,
          painScore: held.painScore,
          previousNextMorningIncrease: held.previousNextMorningIncrease,
          scheduledSessionId: held.scheduledSessionId,
          sessionEffort: held.sessionEffort,
          stiffnessChange: held.stiffnessChange,
          suddenChange: held.suddenChange,
          swellingLevel: held.swellingLevel,
          walkingStatus: held.walkingStatus,
        })
        .then((result) => {
          // Only surface a successful replay; a still-offline retry keeps the held
          // answers and the current state untouched.
          if (result.status === 'classified') {
            applyResult(result, false);
          }
        });
    });
  }, [applyResult, repository, session]);

  // Best-effort replay of any held submission once on mount.
  useEffect(() => {
    retryHeld();
  }, [retryHeld]);

  const reset = useCallback(() => {
    setState({ status: 'form' });
  }, []);

  return { reset, retryHeld, state, submit };
}
