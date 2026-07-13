import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import type {
  NotificationAdapter,
  NotificationPermissionStatus,
} from '@/features/notifications/notificationAdapter';
import type { NotificationPreferencesRepository } from '@/features/notifications/notificationPreferencesRepository';
import { useNotificationSettings } from '@/features/notifications/useNotificationSettings';

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

const NOW = () => new Date(2026, 6, 13, 9, 0, 0, 0);

function repository(
  overrides: Partial<NotificationPreferencesRepository> = {},
): NotificationPreferencesRepository {
  return {
    loadPreferences: jest.fn<
      NotificationPreferencesRepository['loadPreferences']
    >(async () => ({
      preferences: {
        next_morning: false,
        readiness: false,
        sessions: false,
        waist: false,
        weekly_review: false,
        weigh_in: false,
      },
      status: 'ready',
    })),
    loadScheduleData: jest.fn<
      NotificationPreferencesRepository['loadScheduleData']
    >(async () => ({
      data: { lastWaistIso: null, lastWeighInIso: null, sessions: [] },
      status: 'ready',
    })),
    setPreference: jest.fn<NotificationPreferencesRepository['setPreference']>(
      async () => ({ status: 'saved' }),
    ),
    ...overrides,
  };
}

function adapter(status: NotificationPermissionStatus): {
  adapter: NotificationAdapter;
  applySchedule: jest.Mock;
} {
  const applySchedule = jest.fn(async () => {});
  return {
    adapter: {
      applySchedule: applySchedule as NotificationAdapter['applySchedule'],
      async cancelAll() {},
      async getPermissionStatus() {
        return status;
      },
      async requestPermission() {
        return status;
      },
    },
    applySchedule,
  };
}

describe('useNotificationSettings', () => {
  it('loads preferences and reflects the granted permission, and a toggle saves then reschedules', async () => {
    const repo = repository();
    const a = adapter('granted');

    const { result } = await renderHook(() =>
      useNotificationSettings({
        adapter: a.adapter,
        now: NOW,
        repository: repo,
      }),
    );

    await waitFor(() => expect(result.current.loadState.status).toBe('ready'));
    expect(result.current.permission).toEqual({ status: 'granted' });

    await act(async () => {
      result.current.setPreference('sessions', true);
    });

    await waitFor(() => expect(result.current.saveState.status).toBe('saved'));
    expect(repo.setPreference).toHaveBeenCalledWith('user-1', 'sessions', true);
    if (result.current.loadState.status === 'ready') {
      expect(result.current.loadState.preferences.sessions).toBe(true);
    }
    // Enabling a type reschedules through the adapter (a session is now scheduled).
    await waitFor(() => expect(a.applySchedule).toHaveBeenCalled());
  });

  it('reflects denied permission honestly and never schedules, though a toggle still saves', async () => {
    const repo = repository();
    const a = adapter('denied');

    const { result } = await renderHook(() =>
      useNotificationSettings({
        adapter: a.adapter,
        now: NOW,
        repository: repo,
      }),
    );

    await waitFor(() => expect(result.current.loadState.status).toBe('ready'));
    expect(result.current.permission).toEqual({ status: 'denied' });

    await act(async () => {
      result.current.setPreference('weigh_in', true);
    });
    await waitFor(() => expect(result.current.saveState.status).toBe('saved'));

    // The preference is saved, but nothing is scheduled while permission is denied.
    expect(repo.setPreference).toHaveBeenCalledWith('user-1', 'weigh_in', true);
    expect(a.applySchedule).not.toHaveBeenCalled();
  });

  it('shows the unavailable state when there is no repository', async () => {
    const { result } = await renderHook(() =>
      useNotificationSettings({
        adapter: adapter('granted').adapter,
        now: NOW,
        repository: null,
      }),
    );
    await waitFor(() =>
      expect(result.current.loadState.status).toBe('unavailable'),
    );
  });
});
