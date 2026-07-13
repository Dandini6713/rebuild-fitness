// Drives the food-logging actions (docs/03 S-031/S-032). It takes already-validated
// values from the views (the views own Zod validation, mirroring MeasurementFormView)
// and writes plain owner-scoped rows through the repository, exposing one
// saved/offline/error state the screens share. Nothing safety-critical happens here: a
// food log is data the user owns, so there is no classification and no held-and-replayed
// queue — offline simply fails honestly and the user retries.
//
// The saved-food and quick-entry paths differ only in how the FINAL consumed macros are
// produced: a quick entry is entered directly, a saved food is SCALED from its
// per-serving macros by the chosen serving quantity via the pure domain scaleMacros.
// A whole saved meal is expanded server-side by the repository.

import { useCallback, useState } from 'react';

import { scaleMacros, type MealType } from '@/domain/nutrition/nutritionDiary';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultNutritionRepository } from './defaultNutritionRepository';
import type {
  FoodRecord,
  NutritionRepository,
  SaveResult,
} from './nutritionRepository';
import type { ValidatedFood, ValidatedQuickEntry } from './nutritionSchema';

export type FoodLogState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved'; id: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type UseFoodLogOptions = {
  repository?: NutritionRepository | null;
};

const UNAVAILABLE =
  'Saving is not available right now. Please try again later.';

export function useFoodLog(options: UseFoodLogOptions = {}) {
  const { session } = useAuth();
  const repository =
    options.repository === undefined
      ? defaultNutritionRepository
      : options.repository;

  const [state, setState] = useState<FoodLogState>({ status: 'idle' });

  const apply = useCallback((result: SaveResult) => {
    if (result.status === 'saved') {
      setState({ id: result.id, status: 'saved' });
    } else if (result.status === 'offline') {
      setState({ status: 'offline' });
    } else {
      setState({ message: result.message, status: 'error' });
    }
  }, []);

  const run = useCallback(
    (
      action: (
        userId: string,
        repo: NutritionRepository,
      ) => Promise<SaveResult>,
    ) => {
      const userId = session?.user.id;
      if (!repository || !userId) {
        setState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      setState({ status: 'submitting' });
      void action(userId, repository).then(apply);
    },
    [apply, repository, session],
  );

  // A quick calories-and-protein entry straight into the diary (source 'quick').
  const logQuickEntry = useCallback(
    (entry: ValidatedQuickEntry) => {
      run((userId, repo) =>
        repo.logEntry({
          calories: entry.calories,
          carbohydrateG: entry.carbohydrateG,
          description: entry.description,
          fatG: entry.fatG,
          foodId: null,
          loggedAtIso: entry.loggedAtIso,
          mealType: entry.mealType,
          proteinG: entry.proteinG,
          servingQuantity: 1,
          source: 'quick',
          userId,
        }),
      );
    },
    [run],
  );

  // Log a saved food at a serving quantity: its macros are SCALED before writing, so the
  // stored row holds the actual consumed amount (source 'custom').
  const logSavedFood = useCallback(
    (input: {
      food: FoodRecord;
      mealType: MealType;
      loggedAtIso: string;
      servingQuantity: number;
    }) => {
      const scaled = scaleMacros(
        {
          calories: input.food.calories,
          carbohydrateG: input.food.carbohydrateG,
          fatG: input.food.fatG,
          proteinG: input.food.proteinG,
        },
        input.servingQuantity,
      );
      run((userId, repo) =>
        repo.logEntry({
          calories: scaled.calories,
          carbohydrateG: scaled.carbohydrateG ?? null,
          description: input.food.name,
          fatG: scaled.fatG ?? null,
          foodId: input.food.id,
          loggedAtIso: input.loggedAtIso,
          mealType: input.mealType,
          proteinG: scaled.proteinG,
          servingQuantity: input.servingQuantity,
          source: 'custom',
          userId,
        }),
      );
    },
    [run],
  );

  // Log a whole saved meal at once — the repository expands the template's items.
  const logMealTemplate = useCallback(
    (input: {
      templateId: string;
      mealType: MealType;
      loggedAtIso: string;
    }) => {
      run((userId, repo) =>
        repo.logMealTemplate({
          loggedAtIso: input.loggedAtIso,
          mealType: input.mealType,
          templateId: input.templateId,
          userId,
        }),
      );
    },
    [run],
  );

  // Save a reusable personal food (docs/03 S-032). Not a log — a foods row.
  const saveFood = useCallback(
    (food: ValidatedFood) => {
      run((userId, repo) => repo.saveFood({ userId, ...food }));
    },
    [run],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return {
    logMealTemplate,
    logQuickEntry,
    logSavedFood,
    reset,
    saveFood,
    state,
  };
}
