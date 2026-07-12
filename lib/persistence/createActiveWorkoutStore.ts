// Chooses the local workout store for the current platform. Native devices use
// the durable SQLite store; web (and anything without SQLite) falls back to the
// in-memory store. The SQLite module is required lazily inside this function so it
// is only loaded at runtime on a device — importing this file, or the default
// repository that calls it, never pulls expo-sqlite into a test or web bundle.

import { Platform } from 'react-native';

import {
  type ActiveWorkoutStore,
  createMemoryWorkoutStore,
} from './activeWorkoutStore';

export function createActiveWorkoutStore(): ActiveWorkoutStore {
  if (Platform.OS === 'web') {
    return createMemoryWorkoutStore();
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createSqliteWorkoutStore } = require('./sqliteWorkoutStore') as {
    createSqliteWorkoutStore: () => ActiveWorkoutStore;
  };
  return createSqliteWorkoutStore();
}
