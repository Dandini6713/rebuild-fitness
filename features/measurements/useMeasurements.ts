// Loads the measurement history and the computed weight trend for the signed-in user
// (docs/03 S-034 history, docs/06 §6.6), with the loading, error and unavailable states
// the screen needs. Mirrors useToday: it freezes a reference date for the mount, loads
// once (and on explicit reload), and leaves offline to the screen. The trend itself is
// computed in the repository from the pure domain engine.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultMeasurementRepository } from './defaultMeasurementRepository';
import type {
  HistoryResult,
  MeasurementRepository,
} from './measurementRepository';

export type MeasurementsViewState =
  { status: 'loading' } | { status: 'unavailable' } | HistoryResult;

export type UseMeasurementsValue = {
  state: MeasurementsViewState;
  reload: () => void;
};

export function useMeasurements(
  now: Date = new Date(),
  repository: MeasurementRepository | null = defaultMeasurementRepository,
): UseMeasurementsValue {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Freeze the reference date for the lifetime of the mount so the trend windows stay
  // stable across re-renders.
  const [reference] = useState(now);

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = useMemo(
    () => `${userId ?? ''}:${reloadCount}`,
    [userId, reloadCount],
  );
  const [fetched, setFetched] = useState<{
    key: string;
    result: HistoryResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadHistory(reference).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [reference, repository, requestKey, userId]);

  const reload = useCallback(() => {
    setReloadCount((count) => count + 1);
  }, []);

  let state: MeasurementsViewState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { reload, state };
}
