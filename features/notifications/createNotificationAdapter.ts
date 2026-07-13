// Chooses the notification adapter for the current platform, mirroring
// createCardioCueAdapter. Native devices get the real expo-notifications adapter; web (and
// anything else) gets the no-op. The device module is required lazily so it — and
// expo-notifications — is only loaded at runtime on a device, never pulled into a test or
// web bundle.

import { Platform } from 'react-native';

import {
  type NotificationAdapter,
  createNoopNotificationAdapter,
} from './notificationAdapter';

export function createNotificationAdapter(): NotificationAdapter {
  if (Platform.OS === 'web') {
    return createNoopNotificationAdapter();
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const deviceModule = require('./deviceNotificationAdapter') as {
      createDeviceNotificationAdapter: () => NotificationAdapter;
    };
    return deviceModule.createDeviceNotificationAdapter();
  } catch {
    // If the native module cannot load, fall back to the no-op adapter rather than
    // failing: the settings screen still works, it just cannot schedule.
    return createNoopNotificationAdapter();
  }
}
