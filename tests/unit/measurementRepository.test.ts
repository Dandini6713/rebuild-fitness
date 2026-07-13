import { describe, expect, it, jest } from '@jest/globals';

import {
  createMeasurementRepository,
  type MeasurementBackend,
  type MeasurementInsert,
} from '@/features/measurements/measurementRepository';

const REFERENCE = new Date('2026-07-13T08:00:00.000Z');
const MS_PER_DAY = 24 * 60 * 60 * 1000;

function daysAgoIso(daysAgo: number): string {
  return new Date(REFERENCE.getTime() - daysAgo * MS_PER_DAY).toISOString();
}

const insert = (
  overrides: Partial<MeasurementInsert> = {},
): MeasurementInsert => ({
  conditionsNote: null,
  measuredAtIso: daysAgoIso(0),
  type: 'weight',
  unit: 'kg',
  userId: 'user-1',
  value: 82.5,
  ...overrides,
});

describe('measurement repository — logging', () => {
  it('passes an owner-scoped insert through and returns the new id', async () => {
    const insertFn = jest.fn<MeasurementBackend['insert']>(async () => ({
      data: { id: 'measurement-9' },
      error: null,
    }));
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: [], error: null }),
      insert: insertFn,
    });

    const result = await repo.log(insert());
    expect(insertFn).toHaveBeenCalledTimes(1);
    expect(insertFn.mock.calls[0]?.[0]).toEqual(insert());
    expect(result).toEqual({ id: 'measurement-9', status: 'saved' });
  });

  it('fails honestly as offline on a network-shaped error, not a pretend save', async () => {
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: [], error: null }),
      insert: async () => ({
        data: null,
        error: { message: 'Network request failed' },
      }),
    });
    expect(await repo.log(insert())).toEqual({ status: 'offline' });
  });

  it('surfaces a non-network failure as an error', async () => {
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: [], error: null }),
      insert: async () => ({
        data: null,
        error: { message: 'value violates check constraint' },
      }),
    });
    const result = await repo.log(insert());
    expect(result.status).toBe('error');
    if (result.status !== 'error') {
      return;
    }
    expect(result.message).toContain('check constraint');
  });

  it('treats a missing returned id as an error rather than a silent success', async () => {
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: [], error: null }),
      insert: async () => ({ data: null, error: null }),
    });
    expect((await repo.log(insert())).status).toBe('error');
  });
});

describe('measurement repository — history read and trend', () => {
  it('splits weight and waist records and computes the weight trend from the weights only', async () => {
    const rows = [
      {
        conditions_note: null,
        id: 'w1',
        measured_at: daysAgoIso(0),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 80,
      },
      {
        conditions_note: 'morning',
        id: 'w2',
        measured_at: daysAgoIso(2),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 80.2,
      },
      {
        conditions_note: null,
        id: 'w3',
        measured_at: daysAgoIso(5),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 80.4,
      },
      {
        conditions_note: null,
        id: 'w4',
        measured_at: daysAgoIso(9),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 80.6,
      },
      {
        conditions_note: null,
        id: 'w5',
        measured_at: daysAgoIso(12),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 80.8,
      },
      {
        conditions_note: null,
        id: 'w6',
        measured_at: daysAgoIso(13),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 81,
      },
      {
        conditions_note: null,
        id: 'c1',
        measured_at: daysAgoIso(1),
        measurement_type: 'waist' as const,
        unit: 'cm',
        value: 92,
      },
    ];
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: rows, error: null }),
      insert: async () => ({ data: null, error: null }),
    });

    const result = await repo.loadHistory(REFERENCE);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.data.weight.map((r) => r.id)).toEqual([
      'w1',
      'w2',
      'w3',
      'w4',
      'w5',
      'w6',
    ]);
    expect(result.data.waist.map((r) => r.id)).toEqual(['c1']);
    // Six weights spanning fourteen days => a trend, not insufficient-data.
    expect(result.data.trend.status).toBe('trend');
  });

  it('reports insufficient-data when there are too few weights', async () => {
    const rows = [
      {
        conditions_note: null,
        id: 'w1',
        measured_at: daysAgoIso(0),
        measurement_type: 'weight' as const,
        unit: 'kg',
        value: 80,
      },
      {
        conditions_note: null,
        id: 'c1',
        measured_at: daysAgoIso(0),
        measurement_type: 'waist' as const,
        unit: 'cm',
        value: 92,
      },
    ];
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: rows, error: null }),
      insert: async () => ({ data: null, error: null }),
    });
    const result = await repo.loadHistory(REFERENCE);
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.data.trend.status).toBe('insufficient-data');
  });

  it('surfaces a read error with connection-aware copy', async () => {
    const repo = createMeasurementRepository({
      fetchHistory: async () => ({ data: null, error: { message: 'boom' } }),
      insert: async () => ({ data: null, error: null }),
    });
    const result = await repo.loadHistory(REFERENCE);
    expect(result.status).toBe('error');
    if (result.status !== 'error') {
      return;
    }
    expect(result.message).toContain('load your measurements');
  });
});
