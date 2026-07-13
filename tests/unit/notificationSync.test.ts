import { describe, expect, it } from '@jest/globals';

import type {
  NotificationPreferences,
  ScheduledNotification,
} from '@/domain/notifications/notificationSchedule';
import type {
  NotificationAdapter,
  NotificationPermissionStatus,
} from '@/features/notifications/notificationAdapter';
import {
  createNotificationPreferencesRepository,
  type NotificationPreferencesBackend,
} from '@/features/notifications/notificationPreferencesRepository';
import { syncNotifications } from '@/features/notifications/notificationSync';

const MONDAY_9AM = new Date(2026, 6, 13, 9, 0, 0, 0);

function prefs(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  return {
    next_morning: false,
    readiness: false,
    sessions: false,
    waist: false,
    weekly_review: false,
    weigh_in: false,
    ...overrides,
  };
}

// A backend whose scheduled-data reads return a controllable session set.
function backend(
  sessions: {
    id: string;
    scheduled_date: string;
    session_type: string;
    status: string;
    next_morning_check_expected: boolean;
  }[],
): NotificationPreferencesBackend {
  return {
    async fetchLastMeasurement() {
      return { data: null, error: null };
    },
    async fetchPreferences() {
      return { data: null, error: null };
    },
    async fetchSessions() {
      return { data: sessions, error: null };
    },
    async updatePreference() {
      return { error: null };
    },
  };
}

// A recording adapter that MODELS the device contract: applySchedule clears everything then
// re-applies the given set (cancel-and-replace). This lets the test assert idempotency and
// that superseded notifications are cancelled.
function recordingAdapter(initial: NotificationPermissionStatus) {
  const state = { status: initial };
  let scheduled = new Map<string, ScheduledNotification>();
  const calls = { applySchedule: 0, cancelAll: 0, request: 0 };

  const adapter: NotificationAdapter = {
    async applySchedule(list) {
      calls.applySchedule += 1;
      scheduled = new Map();
      for (const n of list) {
        scheduled.set(n.key, n);
      }
    },
    async cancelAll() {
      calls.cancelAll += 1;
      scheduled = new Map();
    },
    async getPermissionStatus() {
      return state.status;
    },
    async requestPermission() {
      calls.request += 1;
      state.status = 'granted';
      return state.status;
    },
  };

  return {
    adapter,
    calls,
    scheduledKeys: () => [...scheduled.keys()],
    setStatus: (status: NotificationPermissionStatus) => {
      state.status = status;
    },
  };
}

describe('syncNotifications — permission handling', () => {
  it('is a graceful no-op when permission is denied (nothing scheduled, no error)', async () => {
    const rec = recordingAdapter('denied');
    const repo = createNotificationPreferencesRepository(
      backend([
        {
          id: 'a',
          next_morning_check_expected: false,
          scheduled_date: '2026-07-14',
          session_type: 'strength',
          status: 'planned',
        },
      ]),
    );

    const result = await syncNotifications({
      adapter: rec.adapter,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: true }),
      repository: repo,
    });

    expect(result).toEqual({ status: 'permission-not-granted' });
    expect(rec.calls.applySchedule).toBe(0);
    expect(rec.calls.cancelAll).toBe(0);
    expect(rec.scheduledKeys()).toEqual([]);
  });

  it('cancels everything when all types are off', async () => {
    const rec = recordingAdapter('granted');
    const repo = createNotificationPreferencesRepository(backend([]));

    const result = await syncNotifications({
      adapter: rec.adapter,
      now: MONDAY_9AM,
      preferences: prefs(),
      repository: repo,
    });

    expect(result).toEqual({ count: 0, status: 'applied' });
    expect(rec.calls.cancelAll).toBe(1);
    expect(rec.scheduledKeys()).toEqual([]);
  });
});

describe('syncNotifications — idempotent rescheduling', () => {
  it('re-applying the same preferences does not duplicate, and turning a type off cancels its notifications', async () => {
    const rec = recordingAdapter('granted');
    const repo = createNotificationPreferencesRepository(
      backend([
        {
          id: 'a',
          next_morning_check_expected: false,
          scheduled_date: '2026-07-14',
          session_type: 'strength',
          status: 'planned',
        },
      ]),
    );

    // First sync with sessions on.
    await syncNotifications({
      adapter: rec.adapter,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: true }),
      repository: repo,
    });
    const first = rec.scheduledKeys();
    expect(first).toEqual(['sessions:a']);

    // Second identical sync: same single notification, no duplicate.
    await syncNotifications({
      adapter: rec.adapter,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: true }),
      repository: repo,
    });
    expect(rec.scheduledKeys()).toEqual(['sessions:a']);

    // Now turn sessions off and turn weekly_review on: the superseded session notification
    // is gone and only the new set remains.
    await syncNotifications({
      adapter: rec.adapter,
      now: MONDAY_9AM,
      preferences: prefs({ weekly_review: true }),
      repository: repo,
    });
    const third = rec.scheduledKeys();
    expect(third).not.toContain('sessions:a');
    expect(third.every((key) => key.startsWith('weekly-review:'))).toBe(true);
  });

  it('leaves the schedule untouched and reports an error when the data read fails', async () => {
    const rec = recordingAdapter('granted');
    const failing = createNotificationPreferencesRepository({
      async fetchLastMeasurement() {
        return { data: null, error: null };
      },
      async fetchPreferences() {
        return { data: null, error: null };
      },
      async fetchSessions() {
        return { data: null, error: { message: 'boom' } };
      },
      async updatePreference() {
        return { error: null };
      },
    });

    const result = await syncNotifications({
      adapter: rec.adapter,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: true }),
      repository: failing,
    });

    expect(result.status).toBe('error');
    expect(rec.calls.applySchedule).toBe(0);
  });
});
