import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  MeasurementHistory,
  MeasurementRepository,
} from '@/features/measurements/measurementRepository';
import { useMeasurements } from '@/features/measurements/useMeasurements';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = new Date('2026-07-13T08:00:00.000Z');

function repository(
  history: MeasurementHistory,
  loadHistory?: MeasurementRepository['loadHistory'],
): MeasurementRepository {
  return {
    loadHistory:
      loadHistory ?? (async () => ({ data: history, status: 'ready' })),
    log: async () => ({ id: 'x', status: 'saved' }),
  };
}

const emptyHistory: MeasurementHistory = {
  trend: {
    inputs: {
      countWithinLongWindow: 0,
      countWithinShortWindow: 0,
      longWindowDays: 14,
      longWindowMinCount: 6,
      referenceDateIso: NOW.toISOString(),
      shortWindowDays: 7,
      shortWindowMinCount: 3,
      tauDays: 7,
      weightCountConsidered: 0,
    },
    ruleVersion: 'weight-trend/v1',
    status: 'insufficient-data',
    unmetThresholds: ['three-in-seven', 'six-in-fourteen'],
  },
  waist: [],
  weight: [],
};

describe('useMeasurements', () => {
  it('loads the history read model for the signed-in user', async () => {
    const repo = repository(emptyHistory);
    const { result } = await renderHook(() => useMeasurements(NOW, repo));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
  });

  it('reloads on demand', async () => {
    let calls = 0;
    const repo = repository(emptyHistory, async () => {
      calls += 1;
      return { data: emptyHistory, status: 'ready' };
    });
    const { result } = await renderHook(() => useMeasurements(NOW, repo));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    expect(calls).toBe(1);
    await act(async () => {
      result.current.reload();
    });
    await waitFor(() => expect(calls).toBe(2));
  });

  it('is unavailable when there is no repository', async () => {
    const { result } = await renderHook(() => useMeasurements(NOW, null));
    await waitFor(() =>
      expect(result.current.state.status).toBe('unavailable'),
    );
  });
});
