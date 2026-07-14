import { describe, expect, it, jest } from '@jest/globals';

import { EXPORTED_TABLES } from '@/domain/account/accountExport';
import {
  type AccountBackend,
  createAccountRepository,
} from '@/features/account/accountRepository';

const USER = 'user-1';
const AT = '2026-07-14T09:00:00.000Z';

function backend(overrides: Partial<AccountBackend> = {}): AccountBackend {
  return {
    deleteAccount: jest.fn(async () => ({ error: null })),
    fetchTable: jest.fn(async (table: string) => ({
      data: [{ table }],
      error: null,
    })),
    listOwnStorageObjects: jest.fn(async () => ({ data: [], error: null })),
    removeStorageObjects: jest.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe('accountRepository — export', () => {
  it('reads every one of the 27 owned tables owner-scoped and assembles the export', async () => {
    const be = backend();
    const repo = createAccountRepository(be);
    const result = await repo.exportData(USER, AT);

    expect(result.status).toBe('ready');
    // Every table was read, scoped to this user.
    expect((be.fetchTable as jest.Mock).mock.calls.length).toBe(
      EXPORTED_TABLES.length,
    );
    for (const table of EXPORTED_TABLES) {
      expect(be.fetchTable).toHaveBeenCalledWith(table, USER);
    }
    if (result.status === 'ready') {
      expect(result.export.exportedAt).toBe(AT);
      // The fetched rows land under their table key.
      expect(result.export.data.profiles).toEqual([{ table: 'profiles' }]);
    }
  });

  it('surfaces a read failure as an error and returns nothing partial', async () => {
    const repo = createAccountRepository(
      backend({
        fetchTable: jest.fn(async () => ({
          data: null,
          error: { message: 'boom' },
        })),
      }),
    );
    const result = await repo.exportData(USER, AT);
    expect(result.status).toBe('error');
  });

  it('classifies a network failure as offline', async () => {
    const repo = createAccountRepository(
      backend({
        fetchTable: jest.fn(async () => ({
          data: null,
          error: { message: 'Network request failed' },
        })),
      }),
    );
    const result = await repo.exportData(USER, AT);
    expect(result.status).toBe('offline');
  });
});

describe('accountRepository — deletion', () => {
  it('clears storage BEFORE calling the delete RPC, then reports deleted', async () => {
    const order: string[] = [];
    const be = backend({
      deleteAccount: jest.fn(async () => {
        order.push('rpc');
        return { error: null };
      }),
      listOwnStorageObjects: jest.fn(async () => {
        order.push('list');
        return { data: ['user-1/a.jpg'], error: null };
      }),
      removeStorageObjects: jest.fn(async () => {
        order.push('remove');
        return { error: null };
      }),
    });
    const repo = createAccountRepository(be);
    const result = await repo.deleteAccount(USER);

    expect(result.status).toBe('deleted');
    // Storage removal precedes the DB deletion (after which storage is unreachable).
    expect(order).toEqual(['list', 'remove', 'rpc']);
    expect(be.removeStorageObjects).toHaveBeenCalledWith(['user-1/a.jpg']);
  });

  it('does not block deletion when storage clearing fails (e.g. no bucket yet)', async () => {
    const be = backend({
      listOwnStorageObjects: jest.fn(async () => ({
        data: null,
        error: { message: 'Bucket not found' },
      })),
    });
    const repo = createAccountRepository(be);
    const result = await repo.deleteAccount(USER);

    expect(result.status).toBe('deleted');
    // A missing bucket means nothing to remove; the RPC still runs.
    expect(be.removeStorageObjects).not.toHaveBeenCalled();
    expect(be.deleteAccount).toHaveBeenCalled();
  });

  it('reports an offline delete honestly (nothing deleted)', async () => {
    const repo = createAccountRepository(
      backend({
        deleteAccount: jest.fn(async () => ({
          error: { message: 'Failed to fetch' },
        })),
      }),
    );
    const result = await repo.deleteAccount(USER);
    expect(result.status).toBe('offline');
  });

  it('reports a delete error', async () => {
    const repo = createAccountRepository(
      backend({
        deleteAccount: jest.fn(async () => ({ error: { message: 'nope' } })),
      }),
    );
    const result = await repo.deleteAccount(USER);
    expect(result.status).toBe('error');
  });
});
