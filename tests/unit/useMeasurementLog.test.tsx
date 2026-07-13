import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  MeasurementInsert,
  MeasurementRepository,
} from '@/features/measurements/measurementRepository';
import type { ValidatedMeasurement } from '@/features/measurements/measurementSchema';
import { useMeasurementLog } from '@/features/measurements/useMeasurementLog';

// A signed-in user so the insert has an owner (RLS additionally checks auth.uid()).
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const validated: ValidatedMeasurement = {
  conditionsNote: 'morning',
  measuredAtIso: '2026-07-13T07:00:00.000Z',
  type: 'weight',
  unit: 'kg',
  value: 82.5,
};

function repository(log: MeasurementRepository['log']): MeasurementRepository {
  return {
    loadHistory: async () => ({
      data: {
        trend: { status: 'insufficient-data' } as never,
        waist: [],
        weight: [],
      },
      status: 'ready',
    }),
    log,
  };
}

describe('useMeasurementLog', () => {
  it('writes the validated measurement with the owner id and reports saved', async () => {
    const calls: MeasurementInsert[] = [];
    const repo = repository(async (input) => {
      calls.push(input);
      return { id: 'm-9', status: 'saved' };
    });
    const { result } = await renderHook(() =>
      useMeasurementLog('weight', { repository: repo }),
    );

    await act(async () => {
      result.current.submit(validated);
    });
    await waitFor(() => expect(result.current.state.status).toBe('saved'));

    expect(calls).toHaveLength(1);
    expect(calls[0]).toEqual({
      conditionsNote: 'morning',
      measuredAtIso: '2026-07-13T07:00:00.000Z',
      type: 'weight',
      unit: 'kg',
      userId: 'user-1',
      value: 82.5,
    });
  });

  it('reports an honest offline failure that can be reset', async () => {
    const repo = repository(async () => ({ status: 'offline' }));
    const { result } = await renderHook(() =>
      useMeasurementLog('weight', { repository: repo }),
    );
    await act(async () => {
      result.current.submit(validated);
    });
    await waitFor(() => expect(result.current.state.status).toBe('offline'));
    await act(async () => {
      result.current.reset();
    });
    await waitFor(() => expect(result.current.state.status).toBe('idle'));
  });

  it('surfaces a server error message', async () => {
    const repo = repository(async () => ({
      message: 'value violates check constraint',
      status: 'error',
    }));
    const { result } = await renderHook(() =>
      useMeasurementLog('waist', { repository: repo }),
    );
    await act(async () => {
      result.current.submit(validated);
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
    if (result.current.state.status !== 'error') {
      return;
    }
    expect(result.current.state.message).toContain('check constraint');
  });

  it('is unavailable when there is no repository', async () => {
    const { result } = await renderHook(() =>
      useMeasurementLog('weight', { repository: null }),
    );
    await act(async () => {
      result.current.submit(validated);
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });
});
