import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

export type SecureStorageBackend = {
  deleteItem(key: string): Promise<void>;
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
};

type StorageMetadata = { chunks: number; generation: number };

export function createSecureAuthStorage(
  backend: SecureStorageBackend,
  chunkSize = 1800,
) {
  return {
    async getItem(key: string): Promise<string | null> {
      const metadata = await readMetadata(backend, key);
      if (!metadata) {
        return null;
      }

      const chunks = await Promise.all(
        Array.from({ length: metadata.chunks }, (_, index) =>
          backend.getItem(chunkKey(key, metadata.generation, index)),
        ),
      );

      return chunks.every((chunk): chunk is string => chunk !== null)
        ? chunks.join('')
        : null;
    },

    async removeItem(key: string): Promise<void> {
      const metadata = await readMetadata(backend, key);
      if (metadata) {
        await deleteChunks(backend, key, metadata);
      }
      await backend.deleteItem(metadataKey(key));
    },

    async setItem(key: string, value: string): Promise<void> {
      const previous = await readMetadata(backend, key);
      const generation = (previous?.generation ?? 0) + 1;
      const chunks = splitIntoChunks(value, chunkSize);

      await Promise.all(
        chunks.map((chunk, index) =>
          backend.setItem(chunkKey(key, generation, index), chunk),
        ),
      );
      await backend.setItem(
        metadataKey(key),
        JSON.stringify({ chunks: chunks.length, generation }),
      );

      if (previous) {
        await deleteChunks(backend, key, previous);
      }
    },
  };
}

const nativeBackend: SecureStorageBackend = {
  deleteItem: (key) => SecureStore.deleteItemAsync(key),
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) =>
    SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
    }),
};

function createMemoryStorage() {
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

export const authStorage =
  Platform.OS === 'web'
    ? createMemoryStorage()
    : createSecureAuthStorage(nativeBackend);

async function readMetadata(
  backend: SecureStorageBackend,
  key: string,
): Promise<StorageMetadata | null> {
  const raw = await backend.getItem(metadataKey(key));
  if (!raw) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(raw);
    if (
      typeof value === 'object' &&
      value !== null &&
      'chunks' in value &&
      'generation' in value &&
      typeof value.chunks === 'number' &&
      typeof value.generation === 'number'
    ) {
      return { chunks: value.chunks, generation: value.generation };
    }
  } catch {
    return null;
  }

  return null;
}

function splitIntoChunks(value: string, chunkSize: number): string[] {
  if (!Number.isInteger(chunkSize) || chunkSize < 1) {
    throw new Error('Secure storage chunk size must be a positive integer.');
  }

  if (value.length === 0) {
    return [''];
  }

  return Array.from(
    { length: Math.ceil(value.length / chunkSize) },
    (_, index) => value.slice(index * chunkSize, (index + 1) * chunkSize),
  );
}

function metadataKey(key: string) {
  return `${key}__meta`;
}

function chunkKey(key: string, generation: number, index: number) {
  return `${key}__${generation}__${index}`;
}

async function deleteChunks(
  backend: SecureStorageBackend,
  key: string,
  metadata: StorageMetadata,
) {
  await Promise.all(
    Array.from({ length: metadata.chunks }, (_, index) =>
      backend.deleteItem(chunkKey(key, metadata.generation, index)),
    ),
  );
}
