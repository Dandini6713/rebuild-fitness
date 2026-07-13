// Loads the weekly alcohol summary (docs/06 §6.9): the five metrics over the seven-day
// window ending today, plus the recent drinks that fed them. Mirrors useNutritionDiary —
// it freezes a reference date for the mount, loads once (and on explicit reload), and
// leaves offline to the screen. The totals, alcohol-free-day count and percentage-of-limit
// are all computed in the repository from the pure domain function on the user's LOCAL
// days.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { toIsoDate } from '@/domain/training/todaySession';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultAlcoholRepository } from './defaultAlcoholRepository';
import type { AlcoholRepository, LoadWeeklyResult } from './alcoholRepository';

export type AlcoholSummaryState =
  { status: 'loading' } | { status: 'unavailable' } | LoadWeeklyResult;

export type UseAlcoholSummaryValue = {
  state: AlcoholSummaryState;
  dayIso: string;
  reload: () => void;
};

export function useAlcoholSummary(
  now: Date = new Date(),
  repository: AlcoholRepository | null = defaultAlcoholRepository,
): UseAlcoholSummaryValue {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [reference] = useState(now);
  const dayIso = useMemo(() => toIsoDate(reference), [reference]);
  // The device's UTC offset for the reference day, so the weekly window and the free-day
  // count use the user's LOCAL calendar days (matching dayIso), not raw UTC days.
  const offsetMinutes = useMemo(
    () => reference.getTimezoneOffset(),
    [reference],
  );

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = useMemo(
    () => `${userId ?? ''}:${dayIso}:${reloadCount}`,
    [userId, dayIso, reloadCount],
  );
  const [fetched, setFetched] = useState<{
    key: string;
    result: LoadWeeklyResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadWeeklySummary(dayIso, offsetMinutes).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [dayIso, offsetMinutes, repository, requestKey, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  let state: AlcoholSummaryState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { dayIso, reload, state };
}
