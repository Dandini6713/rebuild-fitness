// Loads the user's saved drink favourites (docs/03 S-033): the reusable drink definitions
// a one-tap log draws on, most-recently-saved first. Load-only; mirrors useFoodLibrary.
// Saving a new favourite is the useAlcoholLog action.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultAlcoholRepository } from './defaultAlcoholRepository';
import type {
  AlcoholRepository,
  LoadFavouritesResult,
} from './alcoholRepository';

export type DrinkFavouritesState =
  { status: 'loading' } | { status: 'unavailable' } | LoadFavouritesResult;

export function useDrinkFavourites(
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
    result: LoadFavouritesResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadFavourites().then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  let state: DrinkFavouritesState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { reload, state };
}
