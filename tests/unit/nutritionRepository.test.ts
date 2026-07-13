import { describe, expect, it, jest } from '@jest/globals';

import {
  createNutritionRepository,
  type NutritionBackend,
} from '@/features/nutrition/nutritionRepository';

function backend(overrides: Partial<NutritionBackend>): NutritionBackend {
  return {
    deleteTemplate: jest.fn<NutritionBackend['deleteTemplate']>(async () => ({
      error: null,
    })),
    fetchDayLogs: jest.fn<NutritionBackend['fetchDayLogs']>(async () => ({
      data: [],
      error: null,
    })),
    fetchFoods: jest.fn<NutritionBackend['fetchFoods']>(async () => ({
      data: [],
      error: null,
    })),
    fetchRecentLogs: jest.fn<NutritionBackend['fetchRecentLogs']>(async () => ({
      data: [],
      error: null,
    })),
    fetchTargets: jest.fn<NutritionBackend['fetchTargets']>(async () => ({
      data: [],
      error: null,
    })),
    fetchTemplateItems: jest.fn<NutritionBackend['fetchTemplateItems']>(
      async () => ({ data: [], error: null }),
    ),
    fetchTemplates: jest.fn<NutritionBackend['fetchTemplates']>(async () => ({
      data: [],
      error: null,
    })),
    insertFood: jest.fn<NutritionBackend['insertFood']>(async () => ({
      data: { id: 'food-1' },
      error: null,
    })),
    insertLogs: jest.fn<NutritionBackend['insertLogs']>(async () => ({
      data: [{ id: 'log-1' }],
      error: null,
    })),
    insertTarget: jest.fn<NutritionBackend['insertTarget']>(async () => ({
      data: { id: 'target-1' },
      error: null,
    })),
    insertTemplate: jest.fn<NutritionBackend['insertTemplate']>(async () => ({
      data: { id: 'tmpl-1' },
      error: null,
    })),
    insertTemplateItems: jest.fn<NutritionBackend['insertTemplateItems']>(
      async () => ({ error: null }),
    ),
    ...overrides,
  };
}

describe('nutrition repository — targets (history, not overwrite)', () => {
  it('returns the full history and resolves the current target on or before today', async () => {
    const repo = createNutritionRepository(
      backend({
        fetchTargets: async () => ({
          data: [
            {
              calories: 2100,
              created_at: '',
              effective_from: '2026-07-01',
              id: 't2',
              protein_g: 145,
              source: 'user',
            },
            {
              calories: 2200,
              created_at: '',
              effective_from: '2026-06-01',
              id: 't1',
              protein_g: 140,
              source: 'user',
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadTargets('2026-07-13');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.history).toHaveLength(2);
    expect(result.data.current).toEqual({
      calories: 2100,
      effectiveFrom: '2026-07-01',
      proteinG: 145,
    });
  });

  it('inserts a new dated target row (never edits an old one)', async () => {
    const insertTarget = jest.fn<NutritionBackend['insertTarget']>(
      async () => ({
        data: { id: 'target-9' },
        error: null,
      }),
    );
    const repo = createNutritionRepository(backend({ insertTarget }));
    const result = await repo.setTarget({
      calories: 2000,
      effectiveFromIso: '2026-07-13',
      proteinG: 150,
      source: 'user',
      userId: 'u1',
    });
    expect(insertTarget).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'target-9', status: 'saved' });
  });

  it('reports a friendly duplicate error on a same-date collision', async () => {
    const repo = createNutritionRepository(
      backend({
        insertTarget: async () => ({
          data: null,
          error: { code: '23505', message: 'duplicate key value' } as never,
        }),
      }),
    );
    const result = await repo.setTarget({
      calories: 2000,
      effectiveFromIso: '2026-07-13',
      proteinG: 150,
      source: 'user',
      userId: 'u1',
    });
    expect(result.status).toBe('error');
    if (result.status !== 'error') return;
    expect(result.message).toContain('already starts on that date');
  });

  it('fails honestly as offline on a network-shaped error', async () => {
    const repo = createNutritionRepository(
      backend({
        insertTarget: async () => ({
          data: null,
          error: { message: 'Network request failed' },
        }),
      }),
    );
    expect(
      (
        await repo.setTarget({
          calories: 2000,
          effectiveFromIso: '2026-07-13',
          proteinG: 150,
          source: 'user',
          userId: 'u1',
        })
      ).status,
    ).toBe('offline');
  });
});

describe('nutrition repository — foods, recent and favourites', () => {
  it('splits favourites and de-duplicates recent foods from the log', async () => {
    const repo = createNutritionRepository(
      backend({
        fetchFoods: async () => ({
          data: [
            {
              calories: 180,
              carbohydrate_g: null,
              fat_g: null,
              favourite: true,
              id: 'f1',
              name: 'Porridge',
              protein_g: 6,
              serving_description: null,
            },
            {
              calories: 90,
              carbohydrate_g: null,
              fat_g: null,
              favourite: false,
              id: 'f2',
              name: 'Banana',
              protein_g: 1,
              serving_description: null,
            },
          ],
          error: null,
        }),
        fetchRecentLogs: async () => ({
          data: [
            {
              calories: 180,
              description: 'Porridge',
              food_id: 'f1',
              id: 'l3',
              logged_at: '2026-07-13T09:00:00Z',
              meal_type: 'breakfast',
              protein_g: 6,
            },
            {
              calories: 180,
              description: 'Porridge',
              food_id: 'f1',
              id: 'l2',
              logged_at: '2026-07-12T09:00:00Z',
              meal_type: 'breakfast',
              protein_g: 6,
            },
            {
              calories: 250,
              description: 'Flat white',
              food_id: null,
              id: 'l1',
              logged_at: '2026-07-12T08:00:00Z',
              meal_type: 'breakfast',
              protein_g: 8,
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadFoodOptions();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.favourites.map((f) => f.id)).toEqual(['f1']);
    // The repeated Porridge log appears once; the quick entry keys by description.
    expect(result.data.recent.map((r) => r.description)).toEqual([
      'Porridge',
      'Flat white',
    ]);
  });
});

describe('nutrition repository — diary', () => {
  it('sums the day and computes progress against the current target', async () => {
    const repo = createNutritionRepository(
      backend({
        fetchDayLogs: async () => ({
          data: [
            {
              calories: 400,
              description: 'Porridge',
              food_id: null,
              id: 'l1',
              logged_at: '2026-07-13T08:00:00Z',
              meal_type: 'breakfast',
              protein_g: 20,
            },
            {
              calories: 700,
              description: 'Chicken salad',
              food_id: null,
              id: 'l2',
              logged_at: '2026-07-13T12:00:00Z',
              meal_type: 'lunch',
              protein_g: 45,
            },
          ],
          error: null,
        }),
        fetchTargets: async () => ({
          data: [
            {
              calories: 2100,
              created_at: '',
              effective_from: '2026-07-01',
              id: 't1',
              protein_g: 145,
              source: 'user',
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadDiary('2026-07-13');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.summary.totals).toEqual({
      calories: 1100,
      proteinG: 65,
    });
    expect(result.data.summary.meals.map((m) => m.mealType)).toEqual([
      'breakfast',
      'lunch',
    ]);
    expect(result.data.caloriesProgress?.remaining).toBe(1000);
    expect(result.data.proteinProgress?.remaining).toBe(80);
  });

  it('leaves progress null when no target is set, still summing totals', async () => {
    const repo = createNutritionRepository(
      backend({
        fetchDayLogs: async () => ({
          data: [
            {
              calories: 400,
              description: 'Porridge',
              food_id: null,
              id: 'l1',
              logged_at: '2026-07-13T08:00:00Z',
              meal_type: 'breakfast',
              protein_g: 20,
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadDiary('2026-07-13');
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.data.caloriesProgress).toBeNull();
    expect(result.data.summary.totals.calories).toBe(400);
  });
});

describe('nutrition repository — logging', () => {
  it('logs a single entry and returns its id', async () => {
    const insertLogs = jest.fn<NutritionBackend['insertLogs']>(async () => ({
      data: [{ id: 'log-7' }],
      error: null,
    }));
    const repo = createNutritionRepository(backend({ insertLogs }));
    const result = await repo.logEntry({
      calories: 250,
      carbohydrateG: null,
      description: 'Flat white',
      fatG: null,
      foodId: null,
      loggedAtIso: '2026-07-13T09:00:00Z',
      mealType: 'breakfast',
      proteinG: 8,
      servingQuantity: 1,
      source: 'quick',
      userId: 'u1',
    });
    expect(insertLogs).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'log-7', status: 'saved' });
  });

  it('expands a meal template into scaled log rows', async () => {
    const insertLogs = jest.fn<NutritionBackend['insertLogs']>(async () => ({
      data: [{ id: 'log-a' }, { id: 'log-b' }],
      error: null,
    }));
    const repo = createNutritionRepository(
      backend({
        fetchTemplateItems: async () => ({
          data: [
            {
              calories: 180,
              carbohydrate_g: null,
              description: 'Porridge',
              fat_g: null,
              food_id: 'f1',
              id: 'i1',
              meal_template_id: 'tmpl-1',
              protein_g: 6,
              serving_quantity: 2,
            },
            {
              calories: 90,
              carbohydrate_g: null,
              description: 'Banana',
              fat_g: null,
              food_id: null,
              id: 'i2',
              meal_template_id: 'tmpl-1',
              protein_g: 1,
              serving_quantity: 1,
            },
          ],
          error: null,
        }),
        insertLogs,
      }),
    );
    const result = await repo.logMealTemplate({
      loggedAtIso: '2026-07-13T09:00:00Z',
      mealType: 'breakfast',
      templateId: 'tmpl-1',
      userId: 'u1',
    });
    expect(result.status).toBe('saved');
    const rows = insertLogs.mock.calls[0]![0];
    // Porridge scaled by 2 servings: 360 kcal / 12 g; Banana unchanged.
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      calories: 360,
      proteinG: 12,
      source: 'template',
    });
    expect(rows[1]).toMatchObject({
      calories: 90,
      proteinG: 1,
      source: 'template',
    });
  });
});

describe('nutrition repository — saved meals', () => {
  it('rolls back the parent when the items insert fails', async () => {
    const deleteTemplate = jest.fn<NutritionBackend['deleteTemplate']>(
      async () => ({ error: null }),
    );
    const repo = createNutritionRepository(
      backend({
        deleteTemplate,
        insertTemplate: async () => ({ data: { id: 'tmpl-9' }, error: null }),
        insertTemplateItems: async () => ({
          error: { message: 'value violates check constraint' },
        }),
      }),
    );
    const result = await repo.saveTemplate({
      items: [
        {
          calories: 180,
          carbohydrateG: null,
          description: 'Porridge',
          fatG: null,
          foodId: null,
          proteinG: 6,
          servingQuantity: 1,
        },
      ],
      name: 'Usual breakfast',
      userId: 'u1',
    });
    expect(result.status).toBe('error');
    expect(deleteTemplate).toHaveBeenCalledWith('tmpl-9');
  });

  it('summarises templates with item counts and scaled totals', async () => {
    const repo = createNutritionRepository(
      backend({
        fetchTemplates: async () => ({
          data: [{ created_at: '', id: 'tmpl-1', name: 'Usual breakfast' }],
          error: null,
        }),
        fetchTemplateItems: async () => ({
          data: [
            {
              calories: 180,
              carbohydrate_g: null,
              description: 'Porridge',
              fat_g: null,
              food_id: null,
              id: 'i1',
              meal_template_id: 'tmpl-1',
              protein_g: 6,
              serving_quantity: 2,
            },
            {
              calories: 90,
              carbohydrate_g: null,
              description: 'Banana',
              fat_g: null,
              food_id: null,
              id: 'i2',
              meal_template_id: 'tmpl-1',
              protein_g: 1,
              serving_quantity: 1,
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadTemplates();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data[0]).toEqual({
      calories: 450, // 180*2 + 90
      id: 'tmpl-1',
      itemCount: 2,
      name: 'Usual breakfast',
      proteinG: 13, // 6*2 + 1
    });
  });
});
