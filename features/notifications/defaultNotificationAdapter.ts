// The app-wide notification adapter, chosen for the current platform. Resolved LAZILY (and
// cached) so that merely importing the hook never eagerly loads the device adapter — and
// therefore never pulls expo-notifications into a test or web bundle. Tests always inject
// their own recording adapter, so this is only ever constructed at runtime in the real app.

import { createNotificationAdapter } from './createNotificationAdapter';
import type { NotificationAdapter } from './notificationAdapter';

let cached: NotificationAdapter | null = null;

export function getDefaultNotificationAdapter(): NotificationAdapter {
  if (!cached) {
    cached = createNotificationAdapter();
  }
  return cached;
}
