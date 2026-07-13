// Drives the weight/waist entry form (docs/03 S-034). It takes already-validated values
// from the view (the view owns Zod validation, mirroring ReadinessFormView) and writes a
// plain owner-scoped row through the repository, exposing the saved/offline/error states
// the screen needs. Nothing safety-critical happens here: a measurement is data the user
// owns, so there is no classification, no server re-computation and no held-and-replayed
// queue — offline simply fails honestly and the user retries.

import { useCallback, useState } from 'react';

import { useAuth } from '@/features/auth/AuthProvider';

import { defaultMeasurementRepository } from './defaultMeasurementRepository';
import type { LogResult, MeasurementRepository } from './measurementRepository';
import type {
  MeasurementType,
  ValidatedMeasurement,
} from './measurementSchema';

export type MeasurementLogState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'saved'; id: string }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type UseMeasurementLogOptions = {
  repository?: MeasurementRepository | null;
};

export type UseMeasurementLogValue = {
  state: MeasurementLogState;
  submit: (measurement: ValidatedMeasurement) => void;
  reset: () => void;
};

const UNAVAILABLE =
  'Saving measurements is not available right now. Please try again later.';

export function useMeasurementLog(
  _type: MeasurementType,
  options: UseMeasurementLogOptions = {},
): UseMeasurementLogValue {
  const { session } = useAuth();
  const repository =
    options.repository === undefined
      ? defaultMeasurementRepository
      : options.repository;

  const [state, setState] = useState<MeasurementLogState>({ status: 'idle' });

  const submit = useCallback(
    (measurement: ValidatedMeasurement) => {
      const userId = session?.user.id;
      if (!repository || !userId) {
        setState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      setState({ status: 'submitting' });
      void repository
        .log({
          conditionsNote: measurement.conditionsNote,
          measuredAtIso: measurement.measuredAtIso,
          type: measurement.type,
          unit: measurement.unit,
          userId,
          value: measurement.value,
        })
        .then((result: LogResult) => {
          if (result.status === 'saved') {
            setState({ id: result.id, status: 'saved' });
            return;
          }
          if (result.status === 'offline') {
            setState({ status: 'offline' });
            return;
          }
          setState({ message: result.message, status: 'error' });
        });
    },
    [repository, session],
  );

  const reset = useCallback(() => {
    setState({ status: 'idle' });
  }, []);

  return { reset, state, submit };
}
