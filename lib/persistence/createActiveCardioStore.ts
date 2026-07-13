// Chooses the local cardio store for the current platform, mirroring
// createActiveWorkoutStore. Native devices use the durable SQLite store; web (and
// anything without SQLite) falls back to the in-memory store. The SQLite module is
// required lazily so it is only loaded at runtime on a device — importing this
// file, or the default cardio repository that calls it, never pulls expo-sqlite
// into a test or web bundle.

import { Platform } from 'react-native';

import {
  type ActiveCardioStore,
  createMemoryCardioStore,
} from './activeCardioStore';

export function createActiveCardioStore(): ActiveCardioStore {
  if (Platform.OS === 'web') {
    return createMemoryCardioStore();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSqliteCardioStore } = require('./sqliteCardioStore') as {
    createSqliteCardioStore: () => ActiveCardioStore;
  };
  return createSqliteCardioStore();
}
