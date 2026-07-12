// Drives the strength workout player (S-012): loads and continues the in-progress
// workout_log for a scheduled session, holds the live set-entry inputs and the
// elapsed/rest clocks, and records each completed set local-first through the
// repository. The rule and timing logic lives in the pure domain modules
// (workoutPlayer.ts, workoutTimer.ts); this hook only wires state and effects, and
// the view only renders what this returns.
//
// Nothing here diagnoses or assesses anything (docs/07): discomfort is a plain
// self-reported score recorded with a set, and the conservative options are
// scheduling choices, never medical advice.

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  completedExerciseCount,
  deriveExerciseProgress,
  isWorkoutComplete,
  type LoggedSet,
  nextSetNumber,
  resolveCurrentExerciseIndex,
  setsForExercise,
} from '@/domain/training/workoutPlayer';
import { elapsedSeconds } from '@/domain/training/workoutTimer';
import { useAuth } from '@/features/auth/AuthProvider';
import { createOperationId as defaultCreateOperationId } from '@/lib/ids';

import { defaultWorkoutPlayerRepository } from './defaultWorkoutPlayerRepository';
import type {
  PlayerExerciseView,
  PlayerProposal,
  PlayerReadModel,
  WorkoutPlayerRepository,
} from './workoutPlayerRepository';

const DEFAULT_REST_SECONDS = 90;

export type SetInputs = {
  weightKg: number;
  repetitions: number;
  effortScore: number | null;
  discomfortScore: number;
  // Whether the lifter marks this set's technique as controlled. Starts null — an
  // untouched control is left unset, never assumed controlled — so the increase rule
  // (docs/06 §6.4) only ever fires on a technique the lifter deliberately marked
  // controlled. The lifter chooses "Controlled" or "Not controlled" explicitly.
  techniqueControlled: boolean | null;
};

export type RestTimer = { active: boolean; remainingSeconds: number };

export type PlayerReady = {
  status: 'ready';
  workoutName: string;
  elapsedSeconds: number;
  exerciseCount: number;
  exerciseNumber: number;
  completedCount: number;
  isComplete: boolean;
  exercise: PlayerExerciseView;
  setsForExercise: LoggedSet[];
  setsDone: number;
  setsTarget: number;
  inputs: SetInputs;
  rest: RestTimer;
  logging: boolean;
  lastSetSynced: boolean | null;
  ending: boolean;
  endError: string | null;
  // The newest still-open progression proposal for the current exercise, if any.
  // Resolved (accepted or dismissed) proposals are cleared and never reappear.
  proposal: PlayerProposal | null;
  decidingProposal: boolean;
};

export type PlayerViewState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'not-strength' }
  | { status: 'empty' }
  // A red pre-session readiness result blocked creating the log (docs/06 §6.5).
  | { status: 'blocked' }
  | { status: 'error'; message: string }
  | PlayerReady;

export type UseWorkoutPlayerValue = {
  state: PlayerViewState;
  adjustWeight: (delta: number) => void;
  setWeight: (value: number) => void;
  adjustReps: (delta: number) => void;
  setReps: (value: number) => void;
  setEffort: (value: number) => void;
  setDiscomfort: (value: number) => void;
  setTechniqueControlled: (value: boolean) => void;
  logSet: () => void;
  goToPreviousExercise: () => void;
  goToNextExercise: () => void;
  skipRest: () => void;
  retrySync: () => void;
  acceptProposal: () => void;
  dismissProposal: () => void;
  endWorkout: (onComplete: () => void) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function defaultInputs(
  exercise: PlayerExerciseView,
  loggedSets: readonly LoggedSet[],
): SetInputs {
  const recorded = setsForExercise(loggedSets, exercise.exerciseId);
  const last = recorded[recorded.length - 1];
  const weightKg = last?.weightKg ?? exercise.previous?.weightKg ?? 0;
  const repetitions =
    last?.repetitions ??
    exercise.repMax ??
    exercise.previous?.repetitions ??
    exercise.repMin ??
    0;
  return {
    discomfortScore: 0,
    effortScore: null,
    repetitions: Math.max(0, repetitions),
    techniqueControlled: null,
    weightKg: Math.max(0, weightKg),
  };
}

export function useWorkoutPlayer(
  scheduledSessionId: string,
  options: {
    now?: Date;
    repository?: WorkoutPlayerRepository | null;
    createOperationId?: () => string;
  } = {},
): UseWorkoutPlayerValue {
  const repository =
    options.repository === undefined
      ? defaultWorkoutPlayerRepository
      : options.repository;
  const createOperationId =
    options.createOperationId ?? defaultCreateOperationId;

  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // A single clock for elapsed time, the rest timer and set timestamps. In
  // production it is the wall clock; a test can inject a fixed `now` so all three
  // stay consistent and deterministic (no mixing of a frozen seed with Date.now()).
  const [clock] = useState(() => {
    const fixed = options.now;
    return () => (fixed ? fixed.getTime() : Date.now());
  });
  const [nowMs, setNowMs] = useState(() => clock());

  // A fixed clock (injected in tests) never advances, so the per-second tick is
  // pointless there and a real interval would otherwise leak past the test. Only
  // tick against a live wall clock.
  const [isLiveClock] = useState(() => options.now === undefined);

  const [model, setModel] = useState<PlayerReadModel | null>(null);
  const [loadState, setLoadState] = useState<
    'loading' | 'unavailable' | 'not-strength' | 'empty' | 'blocked' | 'error'
  >('loading');
  const [loadError, setLoadError] = useState<string | null>(null);

  const [loggedSets, setLoggedSets] = useState<LoggedSet[]>([]);
  const [manualIndex, setManualIndex] = useState<number | null>(null);
  const [inputs, setInputs] = useState<SetInputs | null>(null);
  const [inputsSeededFor, setInputsSeededFor] = useState<string | null>(null);
  const [logging, setLogging] = useState(false);
  const [lastSetSynced, setLastSetSynced] = useState<boolean | null>(null);
  const [restStartedAtMs, setRestStartedAtMs] = useState<number | null>(null);
  const [restDuration, setRestDuration] = useState(DEFAULT_REST_SECONDS);
  const [ending, setEnding] = useState(false);
  const [endError, setEndError] = useState<string | null>(null);
  // Proposals the user has accepted or dismissed this session, by id, so a resolved
  // proposal is cleared from view immediately and never shown again.
  const [resolvedProposalIds, setResolvedProposalIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [decidingProposal, setDecidingProposal] = useState(false);

  // Which exercise the player is showing: the first still-outstanding one, unless
  // the user has stepped away manually (manualIndex), clamped into range.
  const exercises = useMemo(() => model?.exercises ?? [], [model]);
  const resolvedIndex = resolveCurrentExerciseIndex(exercises, loggedSets);
  const effectiveIndex =
    exercises.length === 0
      ? 0
      : clamp(manualIndex ?? resolvedIndex, 0, exercises.length - 1);
  const currentExercise = exercises[effectiveIndex] ?? null;
  const currentExerciseId = currentExercise?.exerciseId ?? null;

  // Seed the editable set-entry inputs when the shown exercise changes — during
  // render, not in an effect (the derive-don't-effect approach the other hooks
  // use). Logging updates the inputs itself, so this keys on the exercise alone,
  // never on each newly logged set.
  if (currentExercise && currentExerciseId !== inputsSeededFor) {
    setInputsSeededFor(currentExerciseId);
    setInputs(defaultInputs(currentExercise, loggedSets));
  }

  // Load (and continue) the session once we have a repository and a signed-in user.
  // The 'unavailable' (null repository) case is derived during render below, so the
  // effect never writes state synchronously — it only stores the async load result.
  useEffect(() => {
    if (repository === null || !userId) {
      return;
    }
    let active = true;
    void repository
      .loadSession({
        nowIso: new Date(clock()).toISOString(),
        scheduledSessionId,
        userId,
      })
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.status === 'ready') {
          setModel(result.model);
          setLoggedSets(result.model.loggedSets);
        } else if (result.status === 'error') {
          setLoadError(result.message);
          setLoadState('error');
        } else {
          setLoadState(result.status);
        }
      });
    return () => {
      active = false;
    };
  }, [clock, repository, scheduledSessionId, userId]);

  const complete = isWorkoutComplete(exercises, loggedSets);

  // Tick the clocks each second while a live session is open and unfinished. A
  // fixed clock never advances, so the interval is skipped there (see isLiveClock)
  // and cannot leak past a test.
  useEffect(() => {
    if (!isLiveClock || !model || complete) {
      return;
    }
    const id = setInterval(() => setNowMs(clock()), 1000);
    return () => clearInterval(id);
  }, [clock, complete, isLiveClock, model]);

  const rest = useMemo<RestTimer>(() => {
    if (restStartedAtMs === null) {
      return { active: false, remainingSeconds: 0 };
    }
    const endsAtMs = restStartedAtMs + restDuration * 1000;
    const active = endsAtMs > nowMs;
    return {
      active,
      remainingSeconds: active
        ? Math.max(0, Math.ceil((endsAtMs - nowMs) / 1000))
        : 0,
    };
  }, [nowMs, restDuration, restStartedAtMs]);

  const updateInputs = useCallback((patch: Partial<SetInputs>) => {
    setInputs((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const adjustWeight = useCallback(
    (delta: number) => {
      updateInputs(
        inputs
          ? {
              weightKg: Math.max(
                0,
                Math.round((inputs.weightKg + delta) * 100) / 100,
              ),
            }
          : {},
      );
    },
    [inputs, updateInputs],
  );
  const setWeight = useCallback(
    (value: number) => updateInputs({ weightKg: Math.max(0, value) }),
    [updateInputs],
  );
  const adjustReps = useCallback(
    (delta: number) => {
      updateInputs(
        inputs ? { repetitions: Math.max(0, inputs.repetitions + delta) } : {},
      );
    },
    [inputs, updateInputs],
  );
  const setReps = useCallback(
    (value: number) =>
      updateInputs({ repetitions: Math.max(0, Math.round(value)) }),
    [updateInputs],
  );
  const setEffort = useCallback(
    (value: number) =>
      updateInputs({ effortScore: clamp(Math.round(value), 1, 10) }),
    [updateInputs],
  );
  const setDiscomfort = useCallback(
    (value: number) =>
      updateInputs({ discomfortScore: clamp(Math.round(value), 0, 10) }),
    [updateInputs],
  );
  const setTechniqueControlled = useCallback(
    (value: boolean) => updateInputs({ techniqueControlled: value }),
    [updateInputs],
  );

  const logSet = useCallback(() => {
    if (
      repository === null ||
      !userId ||
      !model ||
      !currentExercise ||
      !inputs ||
      logging
    ) {
      return;
    }
    setLogging(true);
    const setNumber = nextSetNumber(loggedSets, currentExercise.exerciseId);
    const completedAtIso = new Date(clock()).toISOString();
    void repository
      .logSet({
        clientOperationId: createOperationId(),
        completedAtIso,
        discomfortScore: inputs.discomfortScore,
        effortScore: inputs.effortScore,
        exerciseId: currentExercise.exerciseId,
        exerciseOrder: currentExercise.order,
        logId: model.logId,
        repetitions: inputs.repetitions,
        setNumber,
        techniqueControlled: inputs.techniqueControlled,
        userId,
        weightKg: inputs.weightKg,
      })
      .then((result) => {
        setLogging(false);
        setLastSetSynced(result.synced);
        setLoggedSets((current) => [...current, result.set]);
        // Snap back to the resolved current exercise and start the rest timer.
        setManualIndex(null);
        setRestDuration(currentExercise.restSeconds ?? DEFAULT_REST_SECONDS);
        setRestStartedAtMs(clock());
      });
  }, [
    clock,
    createOperationId,
    currentExercise,
    inputs,
    logging,
    loggedSets,
    model,
    repository,
    userId,
  ]);

  const goToPreviousExercise = useCallback(() => {
    setManualIndex(Math.max(0, effectiveIndex - 1));
  }, [effectiveIndex]);
  const goToNextExercise = useCallback(() => {
    setManualIndex(Math.min(exercises.length - 1, effectiveIndex + 1));
  }, [effectiveIndex, exercises.length]);

  const skipRest = useCallback(() => setRestStartedAtMs(null), []);

  const retrySync = useCallback(() => {
    if (repository === null || !userId || !model) {
      return;
    }
    void repository.syncPending({ logId: model.logId, userId });
  }, [model, repository, userId]);

  // The proposal currently shown: the current exercise's newest proposal, unless
  // the user has already resolved it this session.
  const activeProposal =
    currentExercise?.proposal &&
    !resolvedProposalIds.has(currentExercise.proposal.id)
      ? currentExercise.proposal
      : null;

  const resolveProposal = useCallback(
    (
      status: 'accepted' | 'dismissed',
      onAccepted?: (weight: number) => void,
    ) => {
      if (
        repository === null ||
        !userId ||
        !activeProposal ||
        decidingProposal
      ) {
        return;
      }
      const proposal = activeProposal;
      setDecidingProposal(true);
      // Clear it from view immediately; the write is confirmation, not a gate.
      setResolvedProposalIds((current) => new Set(current).add(proposal.id));
      if (status === 'accepted' && proposal.proposedWeightKg !== null) {
        onAccepted?.(proposal.proposedWeightKg);
      }
      void repository
        .decideProposal({
          decidedAtIso: new Date(clock()).toISOString(),
          proposalId: proposal.id,
          status,
          userId,
        })
        .then(() => setDecidingProposal(false));
    },
    [activeProposal, clock, decidingProposal, repository, userId],
  );

  const acceptProposal = useCallback(() => {
    resolveProposal('accepted', (weight) =>
      updateInputs({ weightKg: Math.max(0, weight) }),
    );
  }, [resolveProposal, updateInputs]);

  const dismissProposal = useCallback(() => {
    resolveProposal('dismissed');
  }, [resolveProposal]);

  const endWorkout = useCallback(
    (onComplete: () => void) => {
      if (repository === null || !userId || !model || ending) {
        return;
      }
      setEnding(true);
      setEndError(null);
      void repository
        .completeWorkout({
          completedAtIso: new Date(clock()).toISOString(),
          logId: model.logId,
          scheduledSessionId: model.scheduledSessionId,
          sessionEffort: null,
          templateId: model.templateId,
          userId,
        })
        .then((result) => {
          setEnding(false);
          if (result.success) {
            onComplete();
          } else {
            setEndError(result.message);
          }
        });
    },
    [clock, ending, model, repository, userId],
  );

  const state = useMemo<PlayerViewState>(() => {
    if (repository === null) {
      return { status: 'unavailable' };
    }
    if (!model) {
      if (loadState === 'error') {
        return {
          message: loadError ?? 'Something went wrong.',
          status: 'error',
        };
      }
      if (
        loadState === 'unavailable' ||
        loadState === 'not-strength' ||
        loadState === 'empty' ||
        loadState === 'blocked'
      ) {
        return { status: loadState };
      }
      return { status: 'loading' };
    }
    if (!currentExercise || !inputs) {
      return { status: 'loading' };
    }
    const progress = deriveExerciseProgress(currentExercise, loggedSets);
    return {
      completedCount: completedExerciseCount(exercises, loggedSets),
      decidingProposal,
      elapsedSeconds: elapsedSeconds(model.startedAt, nowMs),
      ending,
      endError,
      exercise: currentExercise,
      exerciseCount: exercises.length,
      exerciseNumber: effectiveIndex + 1,
      inputs,
      isComplete: complete,
      lastSetSynced,
      logging,
      proposal: activeProposal,
      rest,
      setsDone: progress.setsDone,
      setsForExercise: setsForExercise(loggedSets, currentExercise.exerciseId),
      setsTarget: progress.setsTarget,
      status: 'ready',
      workoutName: model.workoutName,
    };
  }, [
    activeProposal,
    complete,
    currentExercise,
    decidingProposal,
    effectiveIndex,
    endError,
    ending,
    exercises,
    inputs,
    lastSetSynced,
    loadError,
    loadState,
    logging,
    loggedSets,
    model,
    nowMs,
    repository,
    rest,
  ]);

  return {
    acceptProposal,
    adjustReps,
    adjustWeight,
    dismissProposal,
    endWorkout,
    goToNextExercise,
    goToPreviousExercise,
    logSet,
    retrySync,
    setDiscomfort,
    setEffort,
    setReps,
    setTechniqueControlled,
    setWeight,
    skipRest,
    state,
  };
}
