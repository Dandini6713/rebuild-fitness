// Loads the user's saved meals (docs/05 §5.7) and the action to create one. A saved meal
// is a reusable collection of foods and quantities that logs as a whole. Load mirrors
// useMeasurements; the save action mirrors useMeasurementLog's small state machine.

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultNutritionRepository } from './defaultNutritionRepository';
import type {
  LoadTemplatesResult,
  NutritionRepository,
  SaveResult,
} from './nutritionRepository';
import type { ValidatedMealTemplate } from './nutritionSchema';

export type MealTemplatesState =
  { status: 'loading' } | { status: 'unavailable' } | LoadTemplatesResult;

export type SaveTemplateState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved'; id: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const UNAVAILABLE =
  'Saving a meal is not available right now. Please try again later.';

export function useMealTemplates(
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
    result: LoadTemplatesResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadTemplates().then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [repository, requestKey, userId]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  const [saveState, setSaveState] = useState<SaveTemplateState>({
    status: 'idle',
  });

  const saveTemplate = useCallback(
    (template: ValidatedMealTemplate) => {
      const id = session?.user.id;
      if (!repository || !id) {
        setSaveState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      setSaveState({ status: 'submitting' });
      void repository
        .saveTemplate({
          items: template.items,
          name: template.name,
          userId: id,
        })
        .then((result: SaveResult) => {
          if (result.status === 'saved') {
            setSaveState({ id: result.id, status: 'saved' });
            reload();
          } else if (result.status === 'offline') {
            setSaveState({ status: 'offline' });
          } else {
            setSaveState({ message: result.message, status: 'error' });
          }
        });
    },
    [reload, repository, session],
  );

  const resetSave = useCallback(() => setSaveState({ status: 'idle' }), []);

  let state: MealTemplatesState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  return { reload, resetSave, saveState, saveTemplate, state };
}
