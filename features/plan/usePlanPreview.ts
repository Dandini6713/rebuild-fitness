// Loads the first weeks of the active plan for display, with the loading, empty
// and error states AGENTS.md requires. A connection failure surfaces as an
// error carrying connection-aware copy, which also covers the offline case;
// richer offline caching is a later concern (see CLAUDE.md).

import { useEffect, useState } from 'react';

import { PLAN_PREVIEW_WEEKS } from '@/domain/training/planSchedule';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultPlanRepository } from './defaultPlanRepository';
import type { PlanRepository, PreviewResult } from './planRepository';

export type PlanPreviewState =
  { status: 'loading' } | { status: 'unavailable' } | PreviewResult;

export function usePlanPreview(
  weeks: number = PLAN_PREVIEW_WEEKS,
  repository: PlanRepository | null = defaultPlanRepository,
): PlanPreviewState {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Keyed so a stale fetch for a previous user or week count is treated as
  // "still loading" during render rather than reset with a synchronous setState.
  const requestKey = `${userId ?? ''}:${weeks}`;
  const [fetched, setFetched] = useState<{
    key: string;
    result: PreviewResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadPreview(weeks).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, userId, weeks]);

  if (!repository) {
    return { status: 'unavailable' };
  }
  if (!userId || !fetched || fetched.key !== requestKey) {
    return { status: 'loading' };
  }
  return fetched.result;
}
