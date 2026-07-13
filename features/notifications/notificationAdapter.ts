// The narrow boundary between the pure scheduling DECISION (domain/notifications/
// notificationSchedule.ts) and the device notification EFFECT (expo-notifications). This
// mirrors the cardio cue adapter split (features/cardio/cardioCueAdapter.ts): the pure
// module emits typed descriptors; this adapter requests permission and turns descriptors
// into real OS notifications. It is the ONE part of notifications jest cannot verify —
// permission prompts and OS scheduling are device-runtime behaviour — so it is isolated
// here, mocked in tests, and its real implementation (deviceNotificationAdapter.ts) is
// marked as requiring a simulator/device pass.
//
// GRACEFUL DENIED PERMISSION is a hard requirement (prompt 24): every method is
// best-effort and must never throw into the app. When permission is denied or
// undetermined, applySchedule is a no-op — it does not error — so the app never crashes or
// nags, and the settings screen reflects the honest OS state.

import type { ScheduledNotification } from '@/domain/notifications/notificationSchedule';

// The three OS states the settings screen needs to reflect honestly. `undetermined` means
// the user has not been asked yet (we can request); `denied` means they declined (we route
// them to system settings); `granted` means we may schedule.
export type NotificationPermissionStatus =
  'granted' | 'denied' | 'undetermined';

export type NotificationAdapter = {
  // The current OS permission status, without prompting.
  getPermissionStatus(): Promise<NotificationPermissionStatus>;
  // Ask the OS for permission. A clear, declinable step — never forced. Returns the
  // resulting status.
  requestPermission(): Promise<NotificationPermissionStatus>;
  // Idempotent reschedule: cancel every app-scheduled notification, then schedule exactly
  // this set. Recomputing and re-applying therefore cancels superseded notifications and
  // never duplicates. A no-op when permission is not granted.
  applySchedule(notifications: ScheduledNotification[]): Promise<void>;
  // Cancel every app-scheduled notification (used when the user turns everything off).
  cancelAll(): Promise<void>;
};

// A do-nothing adapter: the default on web and in tests, where there is no OS notification
// service to drive. It reports `denied` so the settings screen honestly shows that
// notifications are unavailable and offers no false "request" affordance, and every write
// is a safe no-op. Tests that want to assert scheduling inject their own recording adapter.
export function createNoopNotificationAdapter(): NotificationAdapter {
  return {
    async applySchedule() {
      /* no-op */
    },
    async cancelAll() {
      /* no-op */
    },
    async getPermissionStatus() {
      return 'denied';
    },
    async requestPermission() {
      return 'denied';
    },
  };
}
