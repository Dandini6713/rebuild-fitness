// Drives the cardio interval player (S-014): loads and continues the in-progress
// cardio_log for a scheduled cardio session, holds the live pause-aware clock, ticks
// the interval timeline, routes cue events to the device adapter, and writes the
// cardio_logs summary on completion. The scheduling and timing logic lives in the
// pure module (domain/training/cardioIntervalPlayer.ts); this hook only wires state
// and effects, and the view only renders what this returns.
//
// The cue DECISION (which cue, when) is pure and tested; the cue EFFECT (sound,
// vibration) is the injected adapter's job — a no-op on web/tests, the real
// audio/haptic adapter on a device (which needs a simulator pass). Tests inject a
// recording adapter and assert cues are ROUTED, never that sound played.
//
// Nothing here diagnoses or assesses anything (docs/07): an interval timer paces a
// walk or run-walk; it is never a safety gate.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  buildCueEvents,
  buildTimeline,
  type CardioClock,
  type CueEvent,
  cuesBetween,
  deriveCardioProgress,
  effectiveElapsedSeconds,
  isPaused as clockIsPaused,
  pauseClock,
  resumeClock,
} from '@/domain/training/cardioIntervalPlayer';
import { useAuth } from '@/features/auth/AuthProvider';

import type { CardioCueAdapter } from './cardioCueAdapter';
import { createCardioCueAdapter } from './createCardioCueAdapter';
import { defaultCardioPlayerRepository } from './defaultCardioPlayerRepository';
import type {
  CardioPlayerRepository,
  CardioReadModel,
} from './cardioPlayerRepository';

export type CardioReady = {
  status: 'ready';
  templateName: string;
  activityKind: string;
  stageNumber: number | null;
  // The current segment (null once complete).
  currentActivity: string | null;
  currentCue: string | null;
  segmentIndex: number;
  segmentCount: number;
  segmentElapsedSeconds: number;
  segmentRemainingSeconds: number;
  totalElapsedSeconds: number;
  totalRemainingSeconds: number;
  totalSeconds: number;
  nextActivity: string | null;
  nextCue: string | null;
  paused: boolean;
  isComplete: boolean;
  completing: boolean;
  completeError: string | null;
  sessionEffort: number | null;
};

export type CardioViewState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'not-cardio' }
  | { status: 'empty' }
  | { status: 'no-programme' }
  | { status: 'error'; message: string }
  | CardioReady;

export type UseCardioPlayerValue = {
  state: CardioViewState;
  pause: () => void;
  resume: () => void;
  setEffort: (value: number) => void;
  end: (onComplete: () => void) => void;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function useCardioPlayer(
  scheduledSessionId: string,
  options: {
    now?: Date;
    repository?: CardioPlayerRepository | null;
    cueAdapter?: CardioCueAdapter;
  } = {},
): UseCardioPlayerValue {
  const repository =
    options.repository === undefined
      ? defaultCardioPlayerRepository
      : options.repository;

  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // A single clock, as in useWorkoutPlayer: the wall clock in production, or a fixed
  // instant injected by a test so every derived time stays deterministic.
  const [clockNow] = useState(() => {
    const fixed = options.now;
    return () => (fixed ? fixed.getTime() : Date.now());
  });
  const [nowMs, setNowMs] = useState(() => clockNow());
  const [isLiveClock] = useState(() => options.now === undefined);

  // The cue adapter lives for the whole session. Injected in tests; the platform
  // adapter (no-op on web, audio/haptic on device) otherwise.
  const [adapter] = useState<CardioCueAdapter>(
    () => options.cueAdapter ?? createCardioCueAdapter(),
  );

  const [model, setModel] = useState<CardioReadModel | null>(null);
  const [clock, setClock] = useState<CardioClock | null>(null);
  const [loadState, setLoadState] = useState<
    'loading' | 'not-cardio' | 'empty' | 'no-programme' | 'error'
  >('loading');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sessionEffort, setSessionEffort] = useState<number | null>(null);
  const [completing, setCompleting] = useState(false);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [finished, setFinished] = useState(false);

  // The cue timeline and the exclusive high-water mark of cues already fired. The
  // ref survives re-renders so each cue fires exactly once as its instant passes.
  const timeline = useMemo(
    () => buildTimeline(model?.steps ?? []),
    [model?.steps],
  );
  const events = useMemo<CueEvent[]>(
    () => buildCueEvents(timeline),
    [timeline],
  );
  const cuedThroughRef = useRef<number>(-1);
  const preparedRef = useRef(false);

  // Load (and continue) the session once we have a repository and a signed-in user.
  useEffect(() => {
    if (repository === null || !userId) {
      return;
    }
    let active = true;
    void repository
      .loadSession({
        nowIso: new Date(clockNow()).toISOString(),
        scheduledSessionId,
        userId,
      })
      .then((result) => {
        if (!active) {
          return;
        }
        if (result.status === 'ready') {
          setModel(result.model);
          setClock(result.model.clock);
          // Seed the cue cursor: a fresh session plays the opening cue (start from
          // -1); a resume seeds to the current elapsed so past cues never replay.
          cuedThroughRef.current = result.model.startedFresh
            ? -1
            : effectiveElapsedSeconds(result.model.clock, clockNow());
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
  }, [clockNow, repository, scheduledSessionId, userId]);

  const progress = useMemo(
    () =>
      clock
        ? deriveCardioProgress(timeline, effectiveElapsedSeconds(clock, nowMs))
        : null,
    [clock, nowMs, timeline],
  );
  const complete = progress?.isComplete ?? false;
  const paused = clock ? clockIsPaused(clock) : false;

  // Prepare the adapter once the session is ready, and release it on unmount.
  useEffect(() => {
    if (!model || preparedRef.current) {
      return;
    }
    preparedRef.current = true;
    adapter.prepare();
    return () => {
      adapter.release();
      preparedRef.current = false;
    };
  }, [adapter, model]);

  // Tick the wall clock each second while the session is live and unfinished. A
  // fixed clock never advances, so the interval is skipped there (as in the strength
  // player) and cannot leak past a test.
  useEffect(() => {
    if (!isLiveClock || !model || complete) {
      return;
    }
    const id = setInterval(() => setNowMs(clockNow()), 1000);
    return () => clearInterval(id);
  }, [clockNow, complete, isLiveClock, model]);

  // Fire any cue events whose instant has passed since the last tick. Runs on every
  // clock change; cuesBetween is (fromExclusive, toInclusive], so each cue fires
  // once. Best-effort adapter — a missed cue never interrupts the session.
  useEffect(() => {
    if (!model || !clock || !preparedRef.current) {
      return;
    }
    const cur = effectiveElapsedSeconds(clock, nowMs);
    const due = cuesBetween(events, cuedThroughRef.current, cur);
    if (due.length > 0) {
      for (const event of due) {
        adapter.cue(event);
      }
      cuedThroughRef.current = cur;
    }
  }, [adapter, clock, events, model, nowMs]);

  const persist = useCallback(
    (next: CardioClock) => {
      if (repository === null || !model) {
        return;
      }
      void repository.saveClock({
        cardioLogId: model.cardioLogId,
        cardioTemplateId: model.cardioTemplateId,
        clock: next,
        nowMs: clockNow(),
        scheduledSessionId: model.scheduledSessionId,
      });
    },
    [clockNow, model, repository],
  );

  const pause = useCallback(() => {
    setClock((current) => {
      if (!current || clockIsPaused(current)) {
        return current;
      }
      const next = pauseClock(current, clockNow());
      persist(next);
      return next;
    });
  }, [clockNow, persist]);

  const resume = useCallback(() => {
    setClock((current) => {
      if (!current || !clockIsPaused(current)) {
        return current;
      }
      const next = resumeClock(current, clockNow());
      persist(next);
      // Keep the display moving immediately on resume without waiting for the tick.
      setNowMs(clockNow());
      return next;
    });
  }, [clockNow, persist]);

  const setEffort = useCallback((value: number) => {
    setSessionEffort(clamp(Math.round(value), 1, 10));
  }, []);

  const end = useCallback(
    (onComplete: () => void) => {
      if (
        repository === null ||
        !userId ||
        !model ||
        !clock ||
        completing ||
        finished
      ) {
        return;
      }
      setCompleting(true);
      setCompleteError(null);
      const durationSeconds = deriveCardioProgress(
        timeline,
        effectiveElapsedSeconds(clock, clockNow()),
      ).totalElapsedSeconds;
      void repository
        .completeSession({
          cardioLogId: model.cardioLogId,
          completedAtIso: new Date(clockNow()).toISOString(),
          durationSeconds,
          scheduledSessionId: model.scheduledSessionId,
          sessionEffort,
          userId,
        })
        .then((result) => {
          setCompleting(false);
          if (result.success) {
            setFinished(true);
            onComplete();
          } else {
            setCompleteError(result.message);
          }
        });
    },
    [
      clock,
      clockNow,
      completing,
      finished,
      model,
      repository,
      sessionEffort,
      timeline,
      userId,
    ],
  );

  const state = useMemo<CardioViewState>(() => {
    if (repository === null) {
      return { status: 'unavailable' };
    }
    if (!model || !progress || !clock) {
      if (loadState === 'error') {
        return {
          message: loadError ?? 'Something went wrong.',
          status: 'error',
        };
      }
      if (
        loadState === 'not-cardio' ||
        loadState === 'empty' ||
        loadState === 'no-programme'
      ) {
        return { status: loadState };
      }
      return { status: 'loading' };
    }
    return {
      activityKind: model.activityKind,
      completeError,
      completing,
      currentActivity: progress.current?.step.activityType ?? null,
      currentCue: progress.current?.step.cueText ?? null,
      isComplete: complete,
      nextActivity: progress.next?.step.activityType ?? null,
      nextCue: progress.next?.step.cueText ?? null,
      paused,
      segmentCount: progress.segmentCount,
      segmentElapsedSeconds: progress.segmentElapsedSeconds,
      segmentIndex: progress.current
        ? progress.current.index
        : progress.segmentCount,
      segmentRemainingSeconds: progress.segmentRemainingSeconds,
      sessionEffort,
      stageNumber: model.stageNumber,
      status: 'ready',
      templateName: model.templateName,
      totalElapsedSeconds: progress.totalElapsedSeconds,
      totalRemainingSeconds: progress.totalRemainingSeconds,
      totalSeconds: timeline.totalSeconds,
    };
  }, [
    clock,
    complete,
    completeError,
    completing,
    loadError,
    loadState,
    model,
    paused,
    progress,
    repository,
    sessionEffort,
    timeline.totalSeconds,
  ]);

  return { end, pause, resume, setEffort, state };
}
