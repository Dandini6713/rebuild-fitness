// Chooses the cue adapter for the current platform, mirroring
// createActiveCardioStore / createActiveWorkoutStore. Native devices get the real
// audio + haptic adapter; web (and anything else) gets the no-op. The device module
// is required lazily so it — and expo-audio / expo-haptics / expo-keep-awake — is
// only loaded at runtime on a device, never pulled into a test or web bundle.

import { Platform } from 'react-native';

import {
  type CardioCueAdapter,
  createNoopCardioCueAdapter,
} from './cardioCueAdapter';

export function createCardioCueAdapter(): CardioCueAdapter {
  if (Platform.OS === 'web') {
    return createNoopCardioCueAdapter();
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const deviceModule = require('./deviceCardioCueAdapter') as {
      createDeviceCardioCueAdapter: () => CardioCueAdapter;
    };
    return deviceModule.createDeviceCardioCueAdapter();
  } catch {
    // If the native modules cannot load, fall back to silent cues rather than
    // failing the player. The session still runs; it is just not audible.
    return createNoopCardioCueAdapter();
  }
}
