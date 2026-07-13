// Loads the food options a diary entry can draw on (docs/03 S-031): the user's saved
// foods, their favourites, and recently-logged foods (derived from the log). Load-only;
// mirrors useMeasurements. Saving a new food is the useFoodLog action.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultNutritionRepository } from './defaultNutritionRepository';
import type {
  LoadFoodsResult,
  NutritionRepository,
} from './nutritionRepository';

export type FoodLibraryState =
  { status: 'loading' } | { status: 'unavailable' } | LoadFoodsResult;

export function useFoodLibrary(
  repository: NutritionRepository | null = defaultNutritionRepository,
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
    result: LoadFoodsResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadFoodOptions().then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  let state: FoodLibraryState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { reload, state };
}
