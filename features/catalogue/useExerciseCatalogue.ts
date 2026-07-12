// Loads the browsable exercise catalogue (roadmap 10). Mirrors useWeeklyPlan's
// loading/unavailable handling; offline is handled by the screen. The catalogue is
// shared reference data, but the read still needs an authenticated session for RLS
// to permit it, so the fetch waits for sign-in.

import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultCatalogueRepository } from './defaultCatalogueRepository';
import type {
  CatalogueRepository,
  CatalogueResult,
} from './exerciseCatalogueRepository';

export type CatalogueViewState =
  { status: 'loading' } | { status: 'unavailable' } | CatalogueResult;

export function useExerciseCatalogue(
  repository: CatalogueRepository | null = defaultCatalogueRepository,
): CatalogueViewState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [fetched, setFetched] = useState<{
    key: string;
    result: CatalogueResult;
  } | null>(null);

  const requestKey = userId ?? '';

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadCatalogue().then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, userId]);

  if (!repository) {
    return { status: 'unavailable' };
  }
  if (!userId || !fetched || fetched.key !== requestKey) {
    return { status: 'loading' };
  }
  return fetched.result;
}
