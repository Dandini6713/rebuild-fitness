import { describe, expect, it, jest } from '@jest/globals';

import {
  createSecureAuthStorage,
  SecureStorageBackend,
} from '@/lib/auth/secureAuthStorage';

function createBackend(): SecureStorageBackend & {
  values: Map<string, string>;
} {
  const values = new Map<string, string>();
  return {
    deleteItem: jest.fn(async (key: string) => {
      values.delete(key);
    }),
    getItem: jest.fn(async (key: string) => values.get(key) ?? null),
    setItem: jest.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    values,
  };
}

describe('secure authentication storage', () => {
  it('round-trips a session larger than one secure-store item', async () => {
    const backend = createBackend();
    const storage = createSecureAuthStorage(backend, 16);
    const session = 'sensitive-session-value-that-needs-chunking';

    await storage.setItem('session', session);

    await expect(storage.getItem('session')).resolves.toBe(session);
    expect(backend.values.size).toBeGreaterThan(2);
    expect([...backend.values.values()]).not.toContain(session);
  });

  it('replaces old chunks without leaving the previous session readable', async () => {
    const backend = createBackend();
    const storage = createSecureAuthStorage(backend, 8);

    await storage.setItem('session', 'first-sensitive-session');
    await storage.setItem('session', 'new-session');

    await expect(storage.getItem('session')).resolves.toBe('new-session');
    expect([...backend.values.values()].join('')).not.toContain(
      'first-sensitive-session',
    );
  });

  it('removes metadata and every session chunk on sign-out', async () => {
    const backend = createBackend();
    const storage = createSecureAuthStorage(backend, 8);
    await storage.setItem('session', 'session-to-remove');

    await storage.removeItem('session');

    await expect(storage.getItem('session')).resolves.toBeNull();
    expect(backend.values.size).toBe(0);
  });

  it('returns null for corrupt metadata or a missing chunk', async () => {
    const backend = createBackend();
    const storage = createSecureAuthStorage(backend, 8);
    backend.values.set('session__meta', 'not-json');
    await expect(storage.getItem('session')).resolves.toBeNull();

    backend.values.set(
      'session__meta',
      JSON.stringify({ chunks: 2, generation: 1 }),
    );
    backend.values.set('session__1__0', 'first');
    await expect(storage.getItem('session')).resolves.toBeNull();
  });

  it('rejects invalid chunk sizes', async () => {
    const storage = createSecureAuthStorage(createBackend(), 0);

    await expect(storage.setItem('session', 'value')).rejects.toThrow(
      'Secure storage chunk size must be a positive integer.',
    );
  });
});
