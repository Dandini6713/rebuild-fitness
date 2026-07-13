// Loads the progress dashboard for the signed-in user (roadmap 21, docs/03 S-040), for
// the selected 4-week or 12-week window. Mirrors useMeasurements: it freezes a reference
// date for the mount so the windows stay stable across re-renders, loads once per
// (user, window, reload), and leaves offline to the screen. All series are computed in
// the repository from the pure domain assemblers.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { toIsoDate } from '@/domain/training/todaySession';
import type { DashboardWindowWeeks } from '@/domain/progress/progressWindows';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultProgressDashboardRepository } from './defaultProgressDashboardRepository';
import type {
  DashboardResult,
  ProgressDashboardRepository,
} from './progressDashboardRepository';

export type ProgressDashboardState =
  { status: 'loading' } | { status: 'unavailable' } | DashboardResult;

export type UseProgressDashboardValue = {
  state: ProgressDashboardState;
  weeks: DashboardWindowWeeks;
  setWeeks: (weeks: DashboardWindowWeeks) => void;
  reload: () => void;
  referenceDayIso: string;
};

export function useProgressDashboard(
  now: Date = new Date(),
  repository: ProgressDashboardRepository | null = defaultProgressDashboardRepository,
  initialWeeks: DashboardWindowWeeks = 4,
): UseProgressDashboardValue {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [reference] = useState(now);
  const referenceDayIso = useMemo(() => toIsoDate(reference), [reference]);
  const offsetMinutes = useMemo(
    () => reference.getTimezoneOffset(),
    [reference],
  );

  const [weeks, setWeeks] = useState<DashboardWindowWeeks>(initialWeeks);
  const [reloadCount, setReloadCount] = useState(0);

  const requestKey = useMemo(
    () => `${userId ?? ''}:${weeks}:${reloadCount}`,
    [userId, weeks, reloadCount],
  );
  const [fetched, setFetched] = useState<{
    key: string;
    result: DashboardResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository
      .load(referenceDayIso, weeks, offsetMinutes, reference)
      .then((result) => {
        if (active) {
          setFetched({ key: requestKey, result });
        }
      });
    return () => {
      active = false;
    };
  }, [
    offsetMinutes,
    reference,
    referenceDayIso,
    repository,
    requestKey,
    userId,
    weeks,
  ]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  let state: ProgressDashboardState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { referenceDayIso, reload, setWeeks, state, weeks };
}
