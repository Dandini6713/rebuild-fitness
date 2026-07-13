// Reads and sets the user's personal weekly unit limit (docs/06 §6.9, docs/07 §7.4). The
// limit is NULLABLE with no invented default: until the user sets one, the
// percentage-of-limit summary metric is simply not shown. Setting it is a plain
// owner-scoped update of the caller's own profiles row.
//
// This is the wired storage + read for the personal limit. A fuller settings surface for
// editing it is a noted seam (there is no settings screen yet); a minimal limit editor
// lives in the alcohol screens so the metric is usable.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultAlcoholRepository } from './defaultAlcoholRepository';
import type {
  AlcoholRepository,
  LoadLimitResult,
  SaveLimitResult,
} from './alcoholRepository';

export type AlcoholLimitLoadState =
  { status: 'loading' } | { status: 'unavailable' } | LoadLimitResult;

export type AlcoholLimitSaveState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const UNAVAILABLE =
  'Saving is not available right now. Please try again later.';

export function useAlcoholLimit(
  repository: AlcoholRepository | null = defaultAlcoholRepository,
) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = useMemo(
    () => `${userId ?? ''}:${reloadCount}`,
    [userId, reloadCount],
  );
  const [fetched, setFetched] = useState<{
    key: string;
    result: LoadLimitResult;
  } | null>(null);
  const [saveState, setSaveState] = useState<AlcoholLimitSaveState>({
    status: 'idle',
  });

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadWeeklyLimit().then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const setLimit = useCallback(
    (units: number) => {
      if (!repository || !userId) {
        setSaveState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      setSaveState({ status: 'submitting' });
      void repository
        .setWeeklyLimit(userId, units)
        .then((result: SaveLimitResult) => {
          if (result.status === 'saved') {
            setSaveState({ status: 'saved' });
            setReloadCount((count) => count + 1);
          } else if (result.status === 'offline') {
            setSaveState({ status: 'offline' });
          } else {
            setSaveState({ message: result.message, status: 'error' });
          }
        });
    },
    [repository, userId],
  );

  let loadState: AlcoholLimitLoadState;
  if (!repository) {
    loadState = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    loadState = { status: 'loading' };
  } else {
    loadState = fetched.result;
  }

  return { loadState, reload, saveState, setLimit };
}
