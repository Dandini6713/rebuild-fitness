// Loads one exercise's guide by slug (roadmap 10, S-013). Same loading/unavailable
// shape as useExerciseCatalogue; the screen handles offline. `not-found` flows
// through from the repository so an unknown slug reads as a missing exercise.

import { useEffect, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultCatalogueRepository } from './defaultCatalogueRepository';
import type {
  CatalogueRepository,
  GuideResult,
} from './exerciseCatalogueRepository';

export type GuideViewState =
  { status: 'loading' } | { status: 'unavailable' } | GuideResult;

export function useExerciseGuide(
  slug: string,
  repository: CatalogueRepository | null = defaultCatalogueRepository,
): GuideViewState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [fetched, setFetched] = useState<{
    key: string;
    result: GuideResult;
  } | null>(null);

  const requestKey = `${userId ?? ''}:${slug}`;

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadGuide(slug).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, slug, userId]);

  if (!repository) {
    return { status: 'unavailable' };
  }
  if (!userId || !fetched || fetched.key !== requestKey) {
    return { status: 'loading' };
  }
  return fetched.result;
}
