import { describe, expect, it, jest } from '@jest/globals';

import {
  type AlcoholBackend,
  createAlcoholRepository,
} from '@/features/alcohol/alcoholRepository';

function backend(overrides: Partial<AlcoholBackend>): AlcoholBackend {
  return {
    deleteFavourite: jest.fn<AlcoholBackend['deleteFavourite']>(async () => ({
      error: null,
    })),
    fetchFavourites: jest.fn<AlcoholBackend['fetchFavourites']>(async () => ({
      data: [],
      error: null,
    })),
    fetchRecentLogs: jest.fn<AlcoholBackend['fetchRecentLogs']>(async () => ({
      data: [],
      error: null,
    })),
    fetchWeeklyLimit: jest.fn<AlcoholBackend['fetchWeeklyLimit']>(async () => ({
      data: null,
      error: null,
    })),
    fetchWindowLogs: jest.fn<AlcoholBackend['fetchWindowLogs']>(async () => ({
      data: [],
      error: null,
    })),
    insertFavourite: jest.fn<AlcoholBackend['insertFavourite']>(async () => ({
      data: { id: 'fav-1' },
      error: null,
    })),
    insertLog: jest.fn<AlcoholBackend['insertLog']>(async () => ({
      data: { id: 'log-1' },
      error: null,
    })),
    updateWeeklyLimit: jest.fn<AlcoholBackend['updateWeeklyLimit']>(
      async () => ({
        error: null,
      }),
    ),
    ...overrides,
  };
}

const rawLog = (
  id: string,
  loggedAt: string,
  units: number,
  calories: number,
) => ({
  abv_percent: 5,
  calories,
  drink_name: id,
  drink_type: null,
  id,
  logged_at: loggedAt,
  occasion_note: null,
  units,
  volume_ml: 568,
});

describe('alcohol repository — logging', () => {
  it('logs a single drink and returns its id', async () => {
    const insertLog = jest.fn<AlcoholBackend['insertLog']>(async () => ({
      data: { id: 'log-9' },
      error: null,
    }));
    const repo = createAlcoholRepository(backend({ insertLog }));
    const result = await repo.logDrink({
      abvPercent: 5,
      calories: 215,
      drinkName: 'Lager',
      drinkType: 'Beer',
      loggedAtIso: '2026-07-13T18:00:00.000Z',
      occasionNote: null,
      units: 2.84,
      userId: 'u1',
      volumeMl: 568,
    });
    expect(insertLog).toHaveBeenCalledTimes(1);
    expect(insertLog.mock.calls[0]![0]).toMatchObject({
      drinkName: 'Lager',
      units: 2.84,
      userId: 'u1',
    });
    expect(result).toEqual({ id: 'log-9', status: 'saved' });
  });

  it('fails honestly as offline on a network-shaped error', async () => {
    const repo = createAlcoholRepository(
      backend({
        insertLog: async () => ({
          data: null,
          error: { message: 'Network request failed' },
        }),
      }),
    );
    const result = await repo.logDrink({
      abvPercent: 5,
      calories: 215,
      drinkName: 'Lager',
      drinkType: null,
      loggedAtIso: '2026-07-13T18:00:00.000Z',
      occasionNote: null,
      units: 2.84,
      userId: 'u1',
      volumeMl: 568,
    });
    expect(result.status).toBe('offline');
  });

  it('surfaces a real (non-network) error message', async () => {
    const repo = createAlcoholRepository(
      backend({
        insertLog: async () => ({
          data: null,
          error: { message: 'value violates check constraint' },
        }),
      }),
    );
    const result = await repo.logDrink({
      abvPercent: 5,
      calories: 215,
      drinkName: 'Lager',
      drinkType: null,
      loggedAtIso: '2026-07-13T18:00:00.000Z',
      occasionNote: null,
      units: 2.84,
      userId: 'u1',
      volumeMl: 568,
    });
    expect(result.status).toBe('error');
  });
});

describe('alcohol repository — favourites', () => {
  it('lists saved favourites as camelCase records', async () => {
    const repo = createAlcoholRepository(
      backend({
        fetchFavourites: async () => ({
          data: [
            {
              abv_percent: 5,
              calories: 215,
              drink_name: 'Pint of lager',
              drink_type: 'Beer',
              id: 'fav-1',
              volume_ml: 568,
            },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.loadFavourites();
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data[0]).toEqual({
      abvPercent: 5,
      calories: 215,
      drinkName: 'Pint of lager',
      drinkType: 'Beer',
      id: 'fav-1',
      volumeMl: 568,
    });
  });

  it('saves a favourite and returns its id', async () => {
    const insertFavourite = jest.fn<AlcoholBackend['insertFavourite']>(
      async () => ({ data: { id: 'fav-7' }, error: null }),
    );
    const repo = createAlcoholRepository(backend({ insertFavourite }));
    const result = await repo.saveFavourite({
      abvPercent: 5,
      calories: 215,
      drinkName: 'Pint of lager',
      drinkType: 'Beer',
      userId: 'u1',
      volumeMl: 568,
    });
    expect(insertFavourite).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: 'fav-7', status: 'saved' });
  });
});

describe('alcohol repository — weekly summary', () => {
  // The backend "filters" a fixed set of logs by the window the repository passes, exactly
  // as the DB would with .gte/.lte on logged_at. This proves the local-day window end to
  // end, not just the pure helper.
  const windowBackend = (
    logs: { id: string; logged_at: string; units: number; calories: number }[],
    weeklyLimit: number | null = null,
  ) =>
    backend({
      fetchWeeklyLimit: async () => ({ data: weeklyLimit, error: null }),
      fetchWindowLogs: async (startIso: string, endIso: string) => ({
        data: logs
          .filter((log) => log.logged_at >= startIso && log.logged_at <= endIso)
          .map((log) => rawLog(log.id, log.logged_at, log.units, log.calories)),
        error: null,
      }),
    });

  it('totals the seven-day window and counts local alcohol-free days (BST)', async () => {
    const logs = [
      // Local 2026-07-13 00:30 in BST → 2026-07-12T23:30Z. Belongs to the 13th.
      {
        calories: 200,
        id: 'a',
        logged_at: '2026-07-12T23:30:00.000Z',
        units: 2.84,
      },
      {
        calories: 180,
        id: 'b',
        logged_at: '2026-07-10T12:00:00.000Z',
        units: 2,
      },
      // Outside the window (before the 7th).
      {
        calories: 300,
        id: 'x',
        logged_at: '2026-07-06T12:00:00.000Z',
        units: 3,
      },
    ];
    const repo = createAlcoholRepository(windowBackend(logs, 14));
    const result = await repo.loadWeeklySummary('2026-07-13', -60);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') return;
    expect(result.data.summary.totalDrinks).toBe(2);
    expect(result.data.summary.totalUnits).toBe(4.84);
    expect(result.data.summary.totalCalories).toBe(380);
    expect(result.data.summary.alcoholFreeDays).toBe(5); // the 13th and 10th have drinks
    expect(result.data.summary.percentOfLimit).toBe(35); // round(4.84/14*100)
    expect(result.data.recent.map((r) => r.id)).toEqual(['a', 'b']);
  });

  it('omits the percentage of limit when no limit is set', async () => {
    const repo = createAlcoholRepository(
      windowBackend(
        [
          {
            calories: 200,
            id: 'a',
            logged_at: '2026-07-13T12:00:00.000Z',
            units: 2,
          },
        ],
        null,
      ),
    );
    const result = await repo.loadWeeklySummary('2026-07-13', -60);
    if (result.status !== 'ready') throw new Error('expected ready');
    expect(result.data.summary.percentOfLimit).toBeNull();
    expect(result.data.summary.weeklyLimitUnits).toBeNull();
  });

  it('reports a read error when the logs query fails', async () => {
    const repo = createAlcoholRepository(
      backend({
        fetchWindowLogs: async () => ({
          data: null,
          error: { message: 'boom' },
        }),
      }),
    );
    const result = await repo.loadWeeklySummary('2026-07-13', -60);
    expect(result.status).toBe('error');
  });
});

describe('alcohol repository — personal weekly limit', () => {
  it('reads the stored limit', async () => {
    const repo = createAlcoholRepository(
      backend({ fetchWeeklyLimit: async () => ({ data: 14, error: null }) }),
    );
    const result = await repo.loadWeeklyLimit();
    expect(result).toEqual({ status: 'ready', units: 14 });
  });

  it('reads null when no limit is set (no invented default)', async () => {
    const repo = createAlcoholRepository(backend({}));
    const result = await repo.loadWeeklyLimit();
    expect(result).toEqual({ status: 'ready', units: null });
  });

  it('updates the limit on the owner profile', async () => {
    const updateWeeklyLimit = jest.fn<AlcoholBackend['updateWeeklyLimit']>(
      async () => ({ error: null }),
    );
    const repo = createAlcoholRepository(backend({ updateWeeklyLimit }));
    const result = await repo.setWeeklyLimit('u1', 14);
    expect(updateWeeklyLimit).toHaveBeenCalledWith('u1', 14);
    expect(result).toEqual({ status: 'saved' });
  });

  it('fails honestly as offline on a network-shaped update error', async () => {
    const repo = createAlcoholRepository(
      backend({
        updateWeeklyLimit: async () => ({
          error: { message: 'Failed to fetch' },
        }),
      }),
    );
    expect((await repo.setWeeklyLimit('u1', 14)).status).toBe('offline');
  });
});
