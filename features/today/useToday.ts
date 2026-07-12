// Loads the Today read model for the signed-in user and exposes the primary
// "start session" action, with the loading, error and unavailable states the shell
// needs. Offline is handled by the screen (mirrors the Plan tab). A connection
// failure surfaces as an error carrying connection-aware copy; richer offline
// caching is a later concern (see CLAUDE.md).

import { useCallback, useEffect, useMemo, useState } from 'react';

import { deriveGreeting, toIsoDate } from '@/domain/training/todaySession';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultTodayRepository } from './defaultTodayRepository';
import type { TodayRepository, TodayResult } from './todayRepository';

export type TodayViewState =
  { status: 'loading' } | { status: 'unavailable' } | TodayResult;

export type UseTodayValue = {
  greeting: string;
  reload: () => void;
  startError: string | null;
  // True once a start was refused because the latest pre-session readiness result is
  // red (docs/06 §6.5). The screen shows the honest red result instead of starting.
  startBlockedByReadiness: boolean;
  startSession: (
    scheduledSessionId: string,
    onStarted?: (scheduledSessionId: string) => void,
  ) => void;
  starting: boolean;
  state: TodayViewState;
  todayIso: string;
};

export function useToday(
  now: Date = new Date(),
  repository: TodayRepository | null = defaultTodayRepository,
): UseTodayValue {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Freeze the reference date for the lifetime of the mount so "today" and the
  // greeting stay stable across re-renders.
  const [reference] = useState(now);
  const todayIso = useMemo(() => toIsoDate(reference), [reference]);
  const greeting = useMemo(
    () => deriveGreeting(reference.getHours()),
    [reference],
  );

  const [reloadCount, setReloadCount] = useState(0);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const [startBlockedByReadiness, setStartBlockedByReadiness] = useState(false);

  const requestKey = `${userId ?? ''}:${todayIso}:${reloadCount}`;
  const [fetched, setFetched] = useState<{
    key: string;
    result: TodayResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.load(todayIso).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, todayIso, userId]);

  const reload = useCallback(() => {
    // Returning to Today (or an explicit reload) clears a prior block: the user may
    // have since recorded a fresh readiness check, so let them try to start again.
    setStartBlockedByReadiness(false);
    setReloadCount((count) => count + 1);
  }, []);

  const startSession = useCallback(
    (
      scheduledSessionId: string,
      onStarted?: (scheduledSessionId: string) => void,
    ) => {
      if (!repository || !userId || starting) {
        return;
      }
      setStarting(true);
      setStartError(null);
      setStartBlockedByReadiness(false);
      void repository
        .startSession({
          scheduledSessionId,
          startedAtIso: new Date().toISOString(),
          userId,
        })
        .then((result) => {
          setStarting(false);
          if (result.success) {
            // Re-load so Today reflects the now in-progress session, then let the
            // caller take over (roadmap 11 opens the workout player on the row
            // that has just been created).
            setReloadCount((count) => count + 1);
            onStarted?.(scheduledSessionId);
          } else if (result.blocked) {
            // A red readiness result blocked the start (docs/06 §6.5). This is a
            // result, not a connection error: show the honest red screen.
            setStartBlockedByReadiness(true);
          } else {
            setStartError(result.message);
          }
        });
    },
    [repository, starting, userId],
  );

  let state: TodayViewState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return {
    greeting,
    reload,
    startBlockedByReadiness,
    startError,
    startSession,
    starting,
    state,
    todayIso,
  };
}
