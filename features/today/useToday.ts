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
  startError: string | null;
  startSession: (scheduledSessionId: string) => void;
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

  const startSession = useCallback(
    (scheduledSessionId: string) => {
      if (!repository || !userId || starting) {
        return;
      }
      setStarting(true);
      setStartError(null);
      void repository
        .startSession({
          scheduledSessionId,
          startedAtIso: new Date().toISOString(),
          userId,
        })
        .then((result) => {
          setStarting(false);
          if (result.success) {
            // Re-load so Today reflects the now in-progress session.
            setReloadCount((count) => count + 1);
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

  return { greeting, startError, startSession, starting, state, todayIso };
}
