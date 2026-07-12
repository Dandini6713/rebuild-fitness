import { describe, expect, it, jest } from '@jest/globals';

import {
  type CatalogueBackend,
  createCatalogueRepository,
} from '@/features/catalogue/exerciseCatalogueRepository';

type RawExercise = NonNullable<
  Awaited<ReturnType<CatalogueBackend['fetchExercise']>>['data']
>;

function raw(overrides: Partial<RawExercise> & { slug: string }): RawExercise {
  return {
    beginner_setup: 'Set the seat',
    breathing: 'Breathe out on effort',
    common_mistakes: 'Rushing',
    execution_steps: 'Press and return',
    name: overrides.slug,
    starting_position: 'Sit tall',
    stop_criteria: 'Stop for sharp pain',
    substitution_options: 'A gentler alternative',
    ...overrides,
  };
}

function backend(overrides: Partial<CatalogueBackend>): CatalogueBackend {
  return {
    fetchExercises: jest.fn<CatalogueBackend['fetchExercises']>(async () => ({
      data: [],
      error: null,
    })),
    fetchExercise: jest.fn<CatalogueBackend['fetchExercise']>(async () => ({
      data: null,
      error: null,
    })),
    ...overrides,
  };
}

describe('catalogue repository — loadCatalogue', () => {
  it('reports empty when no exercises come back', async () => {
    const repo = createCatalogueRepository(backend({}));
    await expect(repo.loadCatalogue()).resolves.toEqual({ status: 'empty' });
  });

  it('surfaces a friendly error when the read fails', async () => {
    const repo = createCatalogueRepository(
      backend({
        fetchExercises: async () => ({
          data: null,
          error: { message: 'network' },
        }),
      }),
    );
    const result = await repo.loadCatalogue();
    expect(result.status).toBe('error');
    if (result.status === 'error') {
      expect(result.message).toContain('could not load');
    }
  });

  it('groups the fetched exercises into their strength sessions', async () => {
    const repo = createCatalogueRepository(
      backend({
        fetchExercises: async () => ({
          data: [
            raw({ name: 'Leg press', slug: 'leg-press' }),
            raw({ name: 'Lat pulldown', slug: 'lat-pulldown' }),
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadCatalogue();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.groups.map((group) => group.key)).toEqual([
      'strength-a',
      'strength-b',
    ]);
    expect(result.groups[0]?.exercises[0]?.name).toBe('Leg press');
  });
});

describe('catalogue repository — loadGuide', () => {
  it('reports not-found for an unknown slug', async () => {
    const repo = createCatalogueRepository(
      backend({ fetchExercise: async () => ({ data: null, error: null }) }),
    );
    await expect(repo.loadGuide('missing')).resolves.toEqual({
      status: 'not-found',
    });
  });

  it('surfaces a friendly error when the read fails', async () => {
    const repo = createCatalogueRepository(
      backend({
        fetchExercise: async () => ({
          data: null,
          error: { message: 'network' },
        }),
      }),
    );
    const result = await repo.loadGuide('leg-press');
    expect(result.status).toBe('error');
  });

  it('maps a row to its ordered guide sections', async () => {
    const repo = createCatalogueRepository(
      backend({
        fetchExercise: async () => ({
          data: raw({
            breathing: null,
            name: 'Leg press',
            slug: 'leg-press',
          }),
          error: null,
        }),
      }),
    );
    const result = await repo.loadGuide('leg-press');
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.name).toBe('Leg press');
    // Breathing was null, so it is absent; the rest keep screen order.
    expect(result.sections.map((section) => section.key)).toEqual([
      'equipment-setup',
      'starting-position',
      'movement',
      'common-mistakes',
      'stop-criteria',
      'approved-alternatives',
    ]);
  });
});
