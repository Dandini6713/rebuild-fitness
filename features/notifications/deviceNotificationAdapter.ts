// The native expo-notifications implementation of NotificationAdapter (roadmap 24, docs/03
// S-051). Local notifications only — push / remote is a declared seam (prompt 24).
//
// ⚠️ REQUIRES A SIMULATOR / DEVICE PASS. This is the only part of notifications that jest
// cannot verify: permission prompts and OS scheduling are device-runtime behaviour, and
// nothing in this repo has run in a simulator yet. It is loaded lazily on native ONLY (see
// createNotificationAdapter.ts) so it — and expo-notifications — is never pulled into a
// test or web bundle; tests inject a recording adapter and assert descriptor ROUTING, not
// OS delivery. Signing this off means: on a device, grant permission and confirm each
// enabled reminder actually arrives at its local fire time, that denying permission
// no-ops cleanly, and that toggling a type off cancels its pending notifications.
//
// Every call is wrapped so a runtime failure never throws into the app: a missed schedule
// must not crash a screen. When permission is not granted, applySchedule is a no-op — the
// graceful-denied guarantee (prompt 24).

import {
  cancelAllScheduledNotificationsAsync,
  getPermissionsAsync,
  requestPermissionsAsync,
  scheduleNotificationAsync,
  SchedulableTriggerInputTypes,
} from 'expo-notifications';

import type {
  LocalDateTime,
  ScheduledNotification,
} from '@/domain/notifications/notificationSchedule';

import {
  type NotificationAdapter,
  type NotificationPermissionStatus,
} from './notificationAdapter';

// expo returns { granted, canAskAgain, status }. Map to our three states: granted → we may
// schedule; can-ask-again (not yet decided) → undetermined; otherwise → denied.
function toStatus(response: {
  granted: boolean;
  canAskAgain: boolean;
}): NotificationPermissionStatus {
  if (response.granted) {
    return 'granted';
  }
  if (response.canAskAgain) {
    return 'undetermined';
  }
  return 'denied';
}

// Build a device-local Date from the pure LocalDateTime components. `new Date(y, m-1, d,
// h, min)` is interpreted in the device's zone, so the reminder fires on the user's local
// day — never a raw UTC instant.
function toLocalDate(fireAt: LocalDateTime): Date {
  return new Date(
    fireAt.year,
    fireAt.month - 1,
    fireAt.day,
    fireAt.hour,
    fireAt.minute,
    0,
    0,
  );
}

export function createDeviceNotificationAdapter(): NotificationAdapter {
  async function currentStatus(): Promise<NotificationPermissionStatus> {
    try {
      return toStatus(await getPermissionsAsync());
    } catch {
      return 'denied';
    }
  }

  return {
    async applySchedule(notifications: ScheduledNotification[]) {
      try {
        if ((await currentStatus()) !== 'granted') {
          // Graceful no-op: never schedule (or error) without permission.
          return;
        }
        // Idempotent replace: clear everything this app scheduled, then re-apply the
        // current set. This is what makes rescheduling cancel superseded notifications and
        // never duplicate.
        await cancelAllScheduledNotificationsAsync();
        for (const notification of notifications) {
          await scheduleNotificationAsync({
            content: {
              body: notification.body,
              title: notification.title,
            },
            identifier: notification.key,
            trigger: {
              date: toLocalDate(notification.fireAt),
              type: SchedulableTriggerInputTypes.DATE,
            },
          });
        }
      } catch {
        // Best-effort: a scheduling failure must never crash the settings screen.
      }
    },

    async cancelAll() {
      try {
        await cancelAllScheduledNotificationsAsync();
      } catch {
        /* best-effort */
      }
    },

    getPermissionStatus: currentStatus,

    async requestPermission() {
      try {
        return toStatus(await requestPermissionsAsync());
      } catch {
        return 'denied';
      }
    },
  };
}
