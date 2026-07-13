import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  LogInsert,
  NutritionRepository,
} from '@/features/nutrition/nutritionRepository';
import { useFoodLog } from '@/features/nutrition/useFoodLog';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

function repository(
  overrides: Partial<NutritionRepository> = {},
): NutritionRepository {
  return {
    logEntry: jest.fn(async () => ({ id: 'log-1', status: 'saved' as const })),
    logMealTemplate: jest.fn(async () => ({
      id: 'log-2',
      status: 'saved' as const,
    })),
    saveFood: jest.fn(async () => ({ id: 'food-1', status: 'saved' as const })),
    ...overrides,
  } as unknown as NutritionRepository;
}

describe('useFoodLog', () => {
  it('logs a quick entry with the owner id and source "quick"', async () => {
    const calls: LogInsert[] = [];
    const repo = repository({
      logEntry: (async (input: LogInsert) => {
        calls.push(input);
        return { id: 'log-9', status: 'saved' as const };
      }) as NutritionRepository['logEntry'],
    });
    const { result } = await renderHook(() => useFoodLog({ repository: repo }));
    await act(async () => {
      result.current.logQuickEntry({
        calories: 250,
        carbohydrateG: null,
        description: 'Flat white',
        fatG: null,
        loggedAtIso: '2026-07-13T09:00:00.000Z',
        mealType: 'breakfast',
        proteinG: 8,
      });
    });
    await waitFor(() => expect(result.current.state.status).toBe('saved'));
    expect(calls[0]).toMatchObject({
      description: 'Flat white',
      foodId: null,
      servingQuantity: 1,
      source: 'quick',
      userId: 'user-1',
    });
  });

  it('scales a saved food by servings before logging (source "custom")', async () => {
    const calls: LogInsert[] = [];
    const repo = repository({
      logEntry: (async (input: LogInsert) => {
        calls.push(input);
        return { id: 'log-9', status: 'saved' as const };
      }) as NutritionRepository['logEntry'],
    });
    const { result } = await renderHook(() => useFoodLog({ repository: repo }));
    await act(async () => {
      result.current.logSavedFood({
        food: {
          calories: 180,
          carbohydrateG: 30,
          fatG: 3,
          favourite: false,
          id: 'f1',
          name: 'Porridge',
          proteinG: 6,
          servingDescription: null,
        },
        loggedAtIso: '2026-07-13T09:00:00.000Z',
        mealType: 'breakfast',
        servingQuantity: 2,
      });
    });
    await waitFor(() => expect(result.current.state.status).toBe('saved'));
    expect(calls[0]).toMatchObject({
      calories: 360,
      description: 'Porridge',
      foodId: 'f1',
      proteinG: 12,
      servingQuantity: 2,
      source: 'custom',
    });
  });

  it('reports an honest offline failure that can be reset', async () => {
    const repo = repository({
      logEntry: (async () => ({
        status: 'offline' as const,
      })) as NutritionRepository['logEntry'],
    });
    const { result } = await renderHook(() => useFoodLog({ repository: repo }));
    await act(async () => {
      result.current.logQuickEntry({
        calories: 100,
        carbohydrateG: null,
        description: 'X',
        fatG: null,
        loggedAtIso: '2026-07-13T09:00:00.000Z',
        mealType: 'lunch',
        proteinG: 1,
      });
    });
    await waitFor(() => expect(result.current.state.status).toBe('offline'));
    await act(async () => result.current.reset());
    await waitFor(() => expect(result.current.state.status).toBe('idle'));
  });

  it('is unavailable when there is no repository', async () => {
    const { result } = await renderHook(() => useFoodLog({ repository: null }));
    await act(async () => {
      result.current.saveFood({
        calories: 100,
        carbohydrateG: null,
        fatG: null,
        favourite: false,
        name: 'X',
        proteinG: 1,
        servingDescription: null,
      });
    });
    await waitFor(() => expect(result.current.state.status).toBe('error'));
  });
});
