import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  NutritionRepository,
  TargetInsert,
} from '@/features/nutrition/nutritionRepository';
import { useNutritionTargets } from '@/features/nutrition/useNutritionTargets';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = new Date('2026-07-13T09:00:00.000Z');

function repository(
  overrides: Partial<NutritionRepository> = {},
): NutritionRepository {
  return {
    loadTargets: jest.fn(async () => ({
      data: { current: null, history: [] },
      status: 'ready' as const,
    })),
    setTarget: jest.fn(async () => ({
      id: 'target-1',
      status: 'saved' as const,
    })),
    ...overrides,
  } as unknown as NutritionRepository;
}

describe('useNutritionTargets', () => {
  it('loads the current target and history', async () => {
    const repo = repository({
      loadTargets: (async () => ({
        data: {
          current: {
            calories: 2100,
            effectiveFrom: '2026-07-01',
            proteinG: 145,
          },
          history: [
            {
              calories: 2100,
              effectiveFrom: '2026-07-01',
              id: 't1',
              proteinG: 145,
              source: 'user',
            },
          ],
        },
        status: 'ready' as const,
      })) as NutritionRepository['loadTargets'],
    });
    const { result } = await renderHook(() => useNutritionTargets(NOW, repo));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    if (result.current.state.status !== 'ready') return;
    expect(result.current.state.data.current?.calories).toBe(2100);
  });

  it('sets a new target (insert, not overwrite) with the owner id', async () => {
    const calls: TargetInsert[] = [];
    const repo = repository({
      setTarget: (async (input: TargetInsert) => {
        calls.push(input);
        return { id: 'target-9', status: 'saved' as const };
      }) as NutritionRepository['setTarget'],
    });
    const { result } = await renderHook(() => useNutritionTargets(NOW, repo));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      result.current.setTarget({
        calories: 2000,
        effectiveFromIso: '2026-07-13',
        proteinG: 150,
      });
    });
    await waitFor(() => expect(result.current.setState.status).toBe('saved'));
    expect(calls[0]).toEqual({
      calories: 2000,
      effectiveFromIso: '2026-07-13',
      proteinG: 150,
      source: 'user',
      userId: 'user-1',
    });
  });

  it('surfaces a duplicate-date error from the repository', async () => {
    const repo = repository({
      setTarget: (async () => ({
        message:
          'A target already starts on that date. Choose a different start date.',
        status: 'error' as const,
      })) as NutritionRepository['setTarget'],
    });
    const { result } = await renderHook(() => useNutritionTargets(NOW, repo));
    await waitFor(() => expect(result.current.state.status).toBe('ready'));
    await act(async () => {
      result.current.setTarget({
        calories: 2000,
        effectiveFromIso: '2026-07-13',
        proteinG: 150,
      });
    });
    await waitFor(() => expect(result.current.setState.status).toBe('error'));
    if (result.current.setState.status !== 'error') return;
    expect(result.current.setState.message).toContain(
      'already starts on that date',
    );
  });
});
