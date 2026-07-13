// The Notifications settings hook (roadmap 24, docs/03 S-051). It owns three things and
// keeps them consistent: the per-type preferences (read/written via the repository), the
// honest OS permission status (read/requested via the adapter), and rescheduling — every
// time preferences change, or permission is granted, or the screen opens, it recomputes
// and re-applies the schedule (syncNotifications, idempotent). The pure view renders the
// resolved state; it holds none of this logic.
//
// Each type is INDEPENDENTLY optional: toggling one writes only that column and reschedules
// from the full current set. Denied permission is handled gracefully — a toggle still saves
// the preference, but scheduling is a no-op until permission is granted, and the screen
// shows the real OS state.
//
// loadState is DERIVED during render (mirroring useAlcoholLimit) so the load effect never
// calls setState synchronously; the scheduling collaborators (adapter / repository / clock)
// are held in refs synced by an effect, so a caller passing a fresh adapter each render can
// neither re-arm the load effect nor loop it.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type {
  NotificationPreferences,
  NotificationType,
} from '@/domain/notifications/notificationSchedule';
import { useAuth } from '@/features/auth/AuthProvider';

import { getDefaultNotificationAdapter } from './defaultNotificationAdapter';
import { defaultNotificationPreferencesRepository } from './defaultNotificationPreferencesRepository';
import type {
  NotificationAdapter,
  NotificationPermissionStatus,
} from './notificationAdapter';
import type {
  LoadPreferencesResult,
  NotificationPreferencesRepository,
} from './notificationPreferencesRepository';
import { syncNotifications } from './notificationSync';

export type NotificationLoadState =
  | { status: 'loading' }
  | { status: 'unavailable' }
  | { status: 'error'; message: string }
  | { status: 'ready'; preferences: NotificationPreferences };

export type NotificationPermissionState =
  { status: 'loading' } | { status: NotificationPermissionStatus };

export type NotificationSaveState =
  | { status: 'idle' }
  | { status: 'submitting'; type: NotificationType }
  | { status: 'saved' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const UNAVAILABLE =
  'Saving is not available right now. Please try again later.';

export type UseNotificationSettingsOptions = {
  repository?: NotificationPreferencesRepository | null;
  adapter?: NotificationAdapter;
  // Injectable clock so tests can pin "now"; defaults to the real clock.
  now?: () => Date;
};

export function useNotificationSettings(
  options: UseNotificationSettingsOptions = {},
) {
  const repository =
    options.repository === undefined
      ? defaultNotificationPreferencesRepository
      : options.repository;

  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  // Hold the mutable collaborators in refs so effect/callback identities stay stable
  // regardless of how the caller re-creates them each render. Synced in an effect (never
  // mutated during render). The default adapter is resolved lazily and only when none is
  // injected, so tests never construct it.
  const adapterRef = useRef<NotificationAdapter | null>(null);
  const repositoryRef = useRef<NotificationPreferencesRepository | null>(null);
  const nowRef = useRef<() => Date>(() => new Date());
  useEffect(() => {
    adapterRef.current = options.adapter ?? getDefaultNotificationAdapter();
    repositoryRef.current = repository;
    if (options.now) {
      nowRef.current = options.now;
    }
  });

  const [prefsFetched, setPrefsFetched] = useState<{
    key: string;
    result: LoadPreferencesResult;
  } | null>(null);
  const [permission, setPermission] = useState<NotificationPermissionState>({
    status: 'loading',
  });
  const [saveState, setSaveState] = useState<NotificationSaveState>({
    status: 'idle',
  });
  const [reloadCount, setReloadCount] = useState(0);

  const requestKey = useMemo(
    () => `${userId ?? ''}:${reloadCount}`,
    [userId, reloadCount],
  );

  // Reschedule from the given preferences. Best-effort: a scheduling failure never surfaces
  // as a save error (the preference itself was saved). Only does meaningful work when
  // permission is granted; otherwise syncNotifications is a graceful no-op.
  const reschedule = useCallback(
    async (preferences: NotificationPreferences) => {
      const repo = repositoryRef.current;
      const adapter = adapterRef.current;
      if (!repo || !adapter) {
        return;
      }
      try {
        await syncNotifications({
          adapter,
          now: nowRef.current(),
          preferences,
          repository: repo,
        });
      } catch {
        // Best-effort: never let a reschedule crash the screen.
      }
    },
    [],
  );

  // Load preferences and the current permission status, then reschedule on open. setState
  // happens only in the async continuation (never synchronously in the effect body).
  useEffect(() => {
    const repo = repositoryRef.current;
    const adapter = adapterRef.current;
    if (!repo || !adapter || !userId) {
      return;
    }
    let active = true;
    void Promise.all([
      repo.loadPreferences(),
      adapter.getPermissionStatus(),
    ]).then(([prefsResult, permissionStatus]) => {
      if (!active) {
        return;
      }
      setPermission({ status: permissionStatus });
      setPrefsFetched({ key: requestKey, result: prefsResult });
      if (prefsResult.status === 'ready') {
        // Reschedule on open so the near horizon stays filled (declared approach).
        void reschedule(prefsResult.preferences);
      }
    });
    return () => {
      active = false;
    };
  }, [requestKey, userId, reschedule]);

  const refresh = useCallback(() => setReloadCount((count) => count + 1), []);

  const setPreference = useCallback(
    (type: NotificationType, value: boolean) => {
      const repo = repositoryRef.current;
      if (!repo || !userId) {
        setSaveState({ message: UNAVAILABLE, status: 'error' });
        return;
      }
      setSaveState({ status: 'submitting', type });
      void repo.setPreference(userId, type, value).then((result) => {
        if (result.status === 'saved') {
          setSaveState({ status: 'saved' });
          setPrefsFetched((current) => {
            if (!current || current.result.status !== 'ready') {
              return current;
            }
            const preferences = {
              ...current.result.preferences,
              [type]: value,
            };
            void reschedule(preferences);
            return {
              key: current.key,
              result: { preferences, status: 'ready' },
            };
          });
        } else if (result.status === 'offline') {
          setSaveState({ status: 'offline' });
        } else {
          setSaveState({ message: result.message, status: 'error' });
        }
      });
    },
    [userId, reschedule],
  );

  const requestPermission = useCallback(() => {
    const adapter = adapterRef.current;
    if (!adapter) {
      return;
    }
    setPermission({ status: 'loading' });
    void adapter.requestPermission().then((status) => {
      setPermission({ status });
      if (status === 'granted') {
        setPrefsFetched((current) => {
          if (current && current.result.status === 'ready') {
            void reschedule(current.result.preferences);
          }
          return current;
        });
      }
    });
  }, [reschedule]);

  // Derive the load state during render (no setState in the load effect).
  let loadState: NotificationLoadState;
  if (!repository) {
    loadState = { status: 'unavailable' };
  } else if (!userId || !prefsFetched || prefsFetched.key !== requestKey) {
    loadState = { status: 'loading' };
  } else if (prefsFetched.result.status === 'ready') {
    loadState = {
      preferences: prefsFetched.result.preferences,
      status: 'ready',
    };
  } else {
    loadState = { message: prefsFetched.result.message, status: 'error' };
  }

  return {
    loadState,
    permission,
    refresh,
    requestPermission,
    saveState,
    setPreference,
  };
}
