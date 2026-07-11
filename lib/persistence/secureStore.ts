// A small chunked key–value store backed by the device keychain. Onboarding
// answers include self-reported health context (docs/07 treats all of it as
// highly private), so the resumable draft lives in secure storage rather than
// plain storage. Reuses the auth module's chunker to stay within the keychain's
// per-item size limit, and falls back to an in-memory map on web/tests.

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

import {
  createSecureAuthStorage,
  type SecureStorageBackend,
} from '@/lib/auth/secureAuthStorage';

export type KeyValueStore = {
  getItem(key: string): Promise<string | null>;
  removeItem(key: string): Promise<void>;
  setItem(key: string, value: string): Promise<void>;
};

const nativeBackend: SecureStorageBackend = {
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
};

export function createMemoryKeyValueStore(): KeyValueStore {
  const values = new Map<string, string>();
  const backend: SecureStorageBackend = {
    async deleteItem(key) {
      values.delete(key);
    },
    async getItem(key) {
      return values.get(key) ?? null;
    },
    async setItem(key, value) {
      values.set(key, value);
    },
  };
  return createSecureAuthStorage(backend);
}

export function createSecureStore(): KeyValueStore {
  return Platform.OS === 'web'
    ? createMemoryKeyValueStore()
    : createSecureAuthStorage(nativeBackend);
}
