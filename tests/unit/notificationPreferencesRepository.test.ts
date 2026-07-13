import { describe, expect, it, jest } from '@jest/globals';

import {
  createNotificationPreferencesRepository,
  type NotificationPreferencesBackend,
} from '@/features/notifications/notificationPreferencesRepository';

function backend(
  overrides: Partial<NotificationPreferencesBackend> = {},
): NotificationPreferencesBackend {
  return {
    fetchLastMeasurement: jest.fn<
      NotificationPreferencesBackend['fetchLastMeasurement']
    >(async () => ({ data: null, error: null })),
    fetchPreferences: jest.fn<
      NotificationPreferencesBackend['fetchPreferences']
    >(async () => ({ data: null, error: null })),
    fetchSessions: jest.fn<NotificationPreferencesBackend['fetchSessions']>(
      async () => ({ data: [], error: null }),
    ),
    updatePreference: jest.fn<
      NotificationPreferencesBackend['updatePreference']
    >(async () => ({ error: null })),
    ...overrides,
  };
}

describe('notificationPreferencesRepository — preferences', () => {
  it('defaults every type to off when there is no profiles row', async () => {
    const repo = createNotificationPreferencesRepository(backend());
    const result = await repo.loadPreferences();
    expect(result).toEqual({
      preferences: {
        next_morning: false,
        readiness: false,
        sessions: false,
        waist: false,
        weekly_review: false,
        weigh_in: false,
      },
      status: 'ready',
    });
  });

  it('maps the profiles columns onto typed preferences', async () => {
    const repo = createNotificationPreferencesRepository(
      backend({
        fetchPreferences: async () => ({
          data: {
            notify_next_morning: false,
            notify_readiness: true,
            notify_sessions: true,
            notify_waist: false,
            notify_weekly_review: false,
            notify_weigh_in: true,
          },
          error: null,
        }),
      }),
    );
    const result = await repo.loadPreferences();
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.preferences.sessions).toBe(true);
    expect(result.preferences.readiness).toBe(true);
    expect(result.preferences.weigh_in).toBe(true);
    expect(result.preferences.waist).toBe(false);
  });

  it('writes exactly the one column for the toggled type', async () => {
    const updates: { column: string; value: boolean }[] = [];
    const repo = createNotificationPreferencesRepository(
      backend({
        updatePreference: async (_userId, column, value) => {
          updates.push({ column, value });
          return { error: null };
        },
      }),
    );

    const result = await repo.setPreference('user-1', 'weekly_review', true);
    expect(result).toEqual({ status: 'saved' });
    expect(updates).toEqual([{ column: 'notify_weekly_review', value: true }]);
  });

  it('reports offline distinctly from a hard error on save', async () => {
    const offlineRepo = createNotificationPreferencesRepository(
      backend({
        updatePreference: async () => ({
          error: { message: 'network request failed' },
        }),
      }),
    );
    expect(await offlineRepo.setPreference('u', 'sessions', true)).toEqual({
      status: 'offline',
    });

    const errorRepo = createNotificationPreferencesRepository(
      backend({
        updatePreference: async () => ({ error: { message: 'denied' } }),
      }),
    );
    expect(await errorRepo.setPreference('u', 'sessions', true)).toEqual({
      message: 'denied',
      status: 'error',
    });
  });
});

describe('notificationPreferencesRepository — schedule data', () => {
  it('maps sessions and last-measurement instants into the scheduler input shape', async () => {
    const repo = createNotificationPreferencesRepository(
      backend({
        fetchLastMeasurement: async (type) => ({
          data: {
            measured_at:
              type === 'weight'
                ? '2026-07-10T06:00:00.000Z'
                : '2026-07-01T06:00:00.000Z',
          },
          error: null,
        }),
        fetchSessions: async () => ({
          data: [
            {
              id: 's1',
              next_morning_check_expected: true,
              scheduled_date: '2026-07-14',
              session_type: 'strength',
              status: 'planned',
            },
          ],
          error: null,
        }),
      }),
    );

    const result = await repo.loadScheduleData('2026-07-12', '2026-07-27');
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.data.sessions).toEqual([
      {
        dateIso: '2026-07-14',
        id: 's1',
        nextMorningExpected: true,
        sessionType: 'strength',
        status: 'planned',
      },
    ]);
    expect(result.data.lastWeighInIso).toBe('2026-07-10T06:00:00.000Z');
    expect(result.data.lastWaistIso).toBe('2026-07-01T06:00:00.000Z');
  });

  it('surfaces a read error from the sessions query', async () => {
    const repo = createNotificationPreferencesRepository(
      backend({
        fetchSessions: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    );
    const result = await repo.loadScheduleData('2026-07-12', '2026-07-27');
    expect(result.status).toBe('error');
  });
});
