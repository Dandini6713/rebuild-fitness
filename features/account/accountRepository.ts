// Server boundary for account data export and deletion (roadmap 25, docs/03 S-053, docs/04
// §4.2, docs/05 §5.11, docs/07 §7.7/§7.8). A narrow backend interface keeps the composition
// testable; a Supabase adapter implements it.
//
// Two very different operations share this repository because they are two halves of the same
// screen:
//
//   * EXPORT is CLIENT-ASSEMBLED. Row-level security already scopes every table to
//     auth.uid() = user_id, so the client legitimately reads all of its OWN rows with no
//     elevated privilege. Each table is read owner-scoped and the pure buildAccountExport
//     shapes the result. No cross-user row can appear because every read is RLS-filtered.
//
//   * DELETION is a TRUSTED SERVER ACTION. It goes through the security-definer delete_account
//     RPC (which deletes the caller's auth.users row, cascading all 27 owned tables). The
//     client cannot name any other user. Storage objects are cleared here first, over the
//     authenticated Storage API scoped to the caller's own prefix, because a SQL cascade does
//     not remove the underlying files — see clearOwnStorage. The recent-auth gate is enforced
//     by the hook/flow (a fresh sign-in) before deleteAccount is ever called.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type AccountExport,
  buildAccountExport,
  EXPORTED_TABLES,
  type ExportedTable,
} from '@/domain/account/accountExport';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// The private bucket progress photographs WILL live in when that feature is built (docs/05
// §5.8, docs/07 §7.9). It does not exist yet, so clearOwnStorage is a correct no-op today.
const PROGRESS_PHOTOS_BUCKET = 'progress-photos';

export type AccountBackend = {
  // Read one owner-scoped table for the export. RLS returns only the caller's rows; the two
  // shared-or-owned template tables are additionally filtered to the caller so system
  // catalogue rows never enter a personal export.
  fetchTable(
    table: ExportedTable,
    userId: string,
  ): Promise<{ data: readonly unknown[] | null; error: BackendError }>;
  // The trusted deletion RPC.
  deleteAccount(): Promise<{ error: BackendError }>;
  // List the caller's own objects under their storage prefix in the progress-photos bucket.
  listOwnStorageObjects(
    userId: string,
  ): Promise<{ data: readonly string[] | null; error: BackendError }>;
  // Remove the given storage objects.
  removeStorageObjects(
    paths: readonly string[],
  ): Promise<{ error: BackendError }>;
};

export function createSupabaseAccountBackend(
  client: SupabaseClient<Database>,
): AccountBackend {
  return {
    async fetchTable(table, userId) {
      // workout_templates / workout_template_exercises are visible to the owner AND as shared
      // system catalogue rows under RLS; a personal export wants only the owner's own, so
      // filter explicitly. Every other table is already owner-only under RLS.
      if (table === 'workout_templates') {
        const { data, error } = await client
          .from('workout_templates')
          .select('*')
          .eq('user_id', userId);
        return { data: (data as readonly unknown[] | null) ?? null, error };
      }
      if (table === 'workout_template_exercises') {
        const { data, error } = await client
          .from('workout_template_exercises')
          .select('*')
          .eq('user_id', userId);
        return { data: (data as readonly unknown[] | null) ?? null, error };
      }
      const { data, error } = await client.from(table).select('*');
      return { data: (data as readonly unknown[] | null) ?? null, error };
    },

    async deleteAccount() {
      const { error } = await client.rpc('delete_account');
      return { error };
    },

    async listOwnStorageObjects(userId) {
      const { data, error } = await client.storage
        .from(PROGRESS_PHOTOS_BUCKET)
        .list(userId);
      if (error) {
        return { data: null, error };
      }
      const paths = (data ?? []).map((object) => `${userId}/${object.name}`);
      return { data: paths, error: null };
    },

    async removeStorageObjects(paths) {
      if (paths.length === 0) {
        return { error: null };
      }
      const { error } = await client.storage
        .from(PROGRESS_PHOTOS_BUCKET)
        .remove([...paths]);
      return { error };
    },
  };
}

// ---- Result shapes ---------------------------------------------------------

export type ExportResult =
  | { status: 'ready'; export: AccountExport }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type DeleteResult =
  | { status: 'deleted' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

const EXPORT_ERROR =
  'We could not prepare your export. Check your connection and try again.';
const DELETE_ERROR =
  'We could not delete your account. Check your connection and try again — nothing has been deleted.';

function looksOffline(error: { message?: string } | null): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
}

// ---- Composed repository ---------------------------------------------------

export function createAccountRepository(backend: AccountBackend) {
  return {
    // Assemble the full export by reading every owned table owner-scoped and shaping the
    // result with the pure builder. A read failure surfaces honestly (offline vs error) and
    // NOTHING partial is returned — a half-read export would be misleading.
    async exportData(
      userId: string,
      exportedAtIso: string,
    ): Promise<ExportResult> {
      const data: Partial<Record<ExportedTable, readonly unknown[]>> = {};
      for (const table of EXPORTED_TABLES) {
        const { data: rows, error } = await backend.fetchTable(table, userId);
        if (error) {
          return looksOffline(error)
            ? { status: 'offline' }
            : { message: error.message || EXPORT_ERROR, status: 'error' };
        }
        data[table] = rows ?? [];
      }
      // Progress photos are unbuilt, so there are no paths to gather yet; the builder records
      // the empty, self-describing storage section.
      const exportObject = buildAccountExport({ data, exportedAtIso, userId });
      return { export: exportObject, status: 'ready' };
    },

    // Permanent, irreversible deletion. The caller (hook/flow) has already required a fresh
    // re-authentication. Storage objects are removed FIRST — the authenticated Storage API is
    // the only thing that removes the underlying files, and after the RPC the session is gone
    // and storage is unreachable. Storage removal is BEST-EFFORT and never blocks the DB
    // deletion: a missing bucket (the case today, since progress photos are unbuilt) or a
    // storage hiccup must not leave an account half-deleted.
    async deleteAccount(userId: string): Promise<DeleteResult> {
      await this.clearOwnStorage(userId);

      const { error } = await backend.deleteAccount();
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || DELETE_ERROR, status: 'error' };
      }
      return { status: 'deleted' };
    },

    // Remove the user's own storage objects under their prefix (docs/05 §5.11, docs/07 §7.9).
    // A no-op today because no bucket exists; correct the moment a progress-photos bucket
    // lands. Errors are swallowed deliberately — see deleteAccount.
    async clearOwnStorage(userId: string): Promise<void> {
      const listed = await backend.listOwnStorageObjects(userId);
      if (listed.error || !listed.data || listed.data.length === 0) {
        return;
      }
      await backend.removeStorageObjects(listed.data);
    },
  };
}

export type AccountRepository = ReturnType<typeof createAccountRepository>;
