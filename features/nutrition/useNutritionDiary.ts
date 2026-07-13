// Loads the food diary for a given day (docs/03 S-031): the day's logged entries grouped
// by meal with running totals, and the day's totals against the current effective target.
// Mirrors useMeasurements — it freezes a reference date for the mount, loads once (and on
// explicit reload), and leaves offline to the screen. The grouping, totals and target
// comparison are all computed in the repository from the pure domain functions.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { toIsoDate } from '@/domain/training/todaySession';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultNutritionRepository } from './defaultNutritionRepository';
import type {
  LoadDiaryResult,
  NutritionRepository,
} from './nutritionRepository';

export type NutritionDiaryState =
  { status: 'loading' } | { status: 'unavailable' } | LoadDiaryResult;

export type UseNutritionDiaryValue = {
  state: NutritionDiaryState;
  dayIso: string;
  reload: () => void;
};

export function useNutritionDiary(
  now: Date = new Date(),
  repository: NutritionRepository | null = defaultNutritionRepository,
): UseNutritionDiaryValue {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [reference] = useState(now);
  const dayIso = useMemo(() => toIsoDate(reference), [reference]);

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = useMemo(
    () => `${userId ?? ''}:${dayIso}:${reloadCount}`,
    [userId, dayIso, reloadCount],
  );
  const [fetched, setFetched] = useState<{
    key: string;
    result: LoadDiaryResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadDiary(dayIso).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [dayIso, repository, requestKey, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  let state: NutritionDiaryState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { dayIso, reload, state };
}
