// Drives the alcohol logging actions (docs/03 S-033). It takes already-validated values
// from the views (the views own Zod validation, mirroring FoodFormView / MeasurementFormView)
// and writes plain owner-scoped rows through the repository, exposing one
// saved/offline/error state the screens share. Nothing safety-critical happens here: a
// drink log is data the user owns, so there is no classification and no held-and-replayed
// queue — offline simply fails honestly and the user retries.
//
// Three write paths, one alcohol_logs shape: a manual drink entry, a one-tap log from a
// saved favourite (units recomputed from the favourite's volume/ABV), and saving a
// reusable favourite. Units are always DERIVED via the pure computeUnits, never entered.

import { useCallback, useState } from 'react';

import { computeUnits } from '@/domain/alcohol/alcoholUnits';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultAlcoholRepository } from './defaultAlcoholRepository';
import type {
  AlcoholRepository,
  DrinkFavouriteRecord,
  SaveResult,
} from './alcoholRepository';
import type {
  ValidatedDrinkFavourite,
  ValidatedDrinkLog,
} from './alcoholSchema';

export type AlcoholLogState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved'; id: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type UseAlcoholLogOptions = {
  repository?: AlcoholRepository | null;
};

const UNAVAILABLE =
  'Saving is not available right now. Please try again later.';

export function useAlcoholLog(options: UseAlcoholLogOptions = {}) {
  const { session } = useAuth();
  const repository =
    options.repository === undefined
      ? defaultAlcoholRepository
      : options.repository;

  const [state, setState] = useState<AlcoholLogState>({ status: 'idle' });

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
      action: (userId: string, repo: AlcoholRepository) => Promise<SaveResult>,
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

  // A manual drink entry straight into the diary. Units already computed by the validator.
  const logDrink = useCallback(
    (drink: ValidatedDrinkLog) => {
      run((userId, repo) =>
        repo.logDrink({
          abvPercent: drink.abvPercent,
          calories: drink.calories,
          drinkName: drink.drinkName,
          drinkType: drink.drinkType,
          loggedAtIso: drink.loggedAtIso,
          occasionNote: drink.occasionNote,
          units: drink.units,
          userId,
          volumeMl: drink.volumeMl,
        }),
      );
    },
    [run],
  );

  // One-tap log from a saved favourite: the drink's units are recomputed from its stored
  // volume and ABV (never taken as a stored figure), at the given time.
  const logFromFavourite = useCallback(
    (input: { favourite: DrinkFavouriteRecord; loggedAtIso: string }) => {
      const { favourite } = input;
      run((userId, repo) =>
        repo.logDrink({
          abvPercent: favourite.abvPercent,
          calories: favourite.calories,
          drinkName: favourite.drinkName,
          drinkType: favourite.drinkType,
          loggedAtIso: input.loggedAtIso,
          occasionNote: null,
          units: computeUnits(favourite.volumeMl, favourite.abvPercent),
          userId,
          volumeMl: favourite.volumeMl,
        }),
      );
    },
    [run],
  );

  // Save a reusable drink favourite (not a log — a drink_favourites row).
  const saveFavourite = useCallback(
    (favourite: ValidatedDrinkFavourite) => {
      run((userId, repo) => repo.saveFavourite({ userId, ...favourite }));
    },
    [run],
  );

  const reset = useCallback(() => setState({ status: 'idle' }), []);

  return { logDrink, logFromFavourite, reset, saveFavourite, state };
}
