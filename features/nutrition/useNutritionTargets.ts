// Loads the effective-dated nutrition targets (docs/05 §5.7, docs/06 §6.8): the current
// target, the full history, and the action to set a new one. Setting a target INSERTS a
// new effective-dated row (never edits an old one), so history is preserved. Load mirrors
// useMeasurements; the set action mirrors useMeasurementLog's small state machine.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { toIsoDate } from '@/domain/training/todaySession';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultNutritionRepository } from './defaultNutritionRepository';
import type {
  LoadTargetsResult,
  NutritionRepository,
  SaveResult,
} from './nutritionRepository';
import type { ValidatedTarget } from './nutritionSchema';

export type NutritionTargetsState =
  { status: 'loading' } | { status: 'unavailable' } | LoadTargetsResult;

export type SetTargetState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const UNAVAILABLE =
  'Saving your target is not available right now. Please try again later.';

export function useNutritionTargets(
  now: Date = new Date(),
  repository: NutritionRepository | null = defaultNutritionRepository,
) {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [reference] = useState(now);
  const todayIso = useMemo(() => toIsoDate(reference), [reference]);

  const [reloadCount, setReloadCount] = useState(0);
  const requestKey = useMemo(
    () => `${userId ?? ''}:${reloadCount}`,
    [userId, reloadCount],
  );
  const [fetched, setFetched] = useState<{
    key: string;
    result: LoadTargetsResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadTargets(todayIso).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, todayIso, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const [setState, setSetState] = useState<SetTargetState>({ status: 'idle' });

  const setTarget = useCallback(
    (target: ValidatedTarget) => {
      const id = session?.user.id;
      if (!repository || !id) {
        setSetState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      setSetState({ status: 'submitting' });
      void repository
        .setTarget({
          calories: target.calories,
          effectiveFromIso: target.effectiveFromIso,
          proteinG: target.proteinG,
          source: 'user',
          userId: id,
        })
        .then((result: SaveResult) => {
          if (result.status === 'saved') {
            setSetState({ status: 'saved' });
            reload();
          } else if (result.status === 'offline') {
            setSetState({ status: 'offline' });
          } else {
            setSetState({ message: result.message, status: 'error' });
          }
        });
    },
    [reload, repository, session],
  );

  const resetSet = useCallback(() => setSetState({ status: 'idle' }), []);

  let state: NutritionTargetsState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { reload, resetSet, setState, setTarget, state, todayIso };
}
