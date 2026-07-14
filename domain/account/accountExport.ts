// Roadmap 25: the pure, versioned assembler for a full account data export (docs/01 FR-082
// "export in a readable machine format", docs/07 §7.7 "provide export and deletion", docs/04
// §4.2). It takes the already-fetched rows for every user-owned table and shapes them into a
// single, self-describing, versioned JSON object. It is pure: no I/O, no clock (the export
// timestamp is passed in), no Supabase — so it is exhaustively unit-testable and the export
// shape is stable and documented in one place.
//
// The export is CLIENT-ASSEMBLED, not server-generated: row-level security already scopes
// every table to auth.uid() = user_id, so the client legitimately reads all of its OWN rows
// and no elevated privilege is needed (unlike deletion, which is a trusted definer RPC). The
// repository does the owner-scoped reads; THIS module only shapes what it is given and never
// invents, merges or filters rows, so if the repository fetched only the owner's rows the
// export contains only the owner's rows.
//
// Completeness is a property of the shape, not of the caller remembering every table: the
// builder ALWAYS emits a key for every entry in EXPORTED_TABLES (empty array when the account
// has no rows there), so a new user's export is a valid, fully-keyed empty export, and adding
// a user-owned table to the app without adding it here fails the "every table present" test.

// The single source of truth for which user-owned tables an export covers. These are the 27
// tables that reference auth.users(id) on delete cascade — i.e. everything account deletion
// removes — so export and deletion cover exactly the same personal data. `exercises` (the
// shared, read-only catalogue) is deliberately excluded: it is reference data, not the user's
// own data. `profiles` carries the notification preferences and calorie/limit config columns,
// so those are included as part of the profile row.
export const EXPORTED_TABLES = [
  'profiles',
  'goals',
  'health_context',
  'training_plans',
  'plan_weeks',
  'workout_templates',
  'workout_template_exercises',
  'scheduled_sessions',
  'readiness_checkins',
  'workout_logs',
  'exercise_logs',
  'set_logs',
  'progression_proposals',
  'running_progression_proposals',
  'cardio_templates',
  'cardio_interval_steps',
  'cardio_logs',
  'nutrition_targets',
  'foods',
  'meal_templates',
  'meal_template_items',
  'nutrition_logs',
  'alcohol_logs',
  'drink_favourites',
  'body_measurements',
  'weekly_reviews',
  'audit_events',
] as const;

export type ExportedTable = (typeof EXPORTED_TABLES)[number];

// The version of the export FORMAT (not the app). Bump this if the shape ever changes so an
// exported file can always be understood by whatever reads it back.
export const ACCOUNT_EXPORT_VERSION = 'rebuild-account-export/v1';

// The rows for each table, keyed by table name. Rows are passed through opaquely: the export
// preserves exactly what the database returned (camelCase vs snake_case is the DB's own
// column naming), so the machine-readable export is a faithful copy of stored data.
export type AccountExportInput = Partial<
  Record<ExportedTable, readonly unknown[]>
>;

// A note about progress photographs, which are SPECCED (docs/05 §5.8) but were never built —
// there is no progress_photos table and no storage bucket after 24 roadmaps. The export is
// honest about this rather than silently omitting the requirement: the section is present,
// empty, and self-describing, and becomes populated (with storage paths) the moment the
// feature lands.
export type AccountExportStorage = {
  // The private storage paths of the user's own objects, ready to accompany the row data.
  // Empty today because no bucket exists yet; see `note`.
  progressPhotos: readonly string[];
  note: string;
};

export type AccountExport = {
  exportVersion: string;
  exportedAt: string;
  userId: string;
  // Human-oriented description so an exported file is understandable on its own.
  description: string;
  // The list of tables covered, so a reader can see the intended completeness at a glance.
  tables: readonly ExportedTable[];
  // The actual row data, one key per table, always fully keyed.
  data: Record<ExportedTable, readonly unknown[]>;
  storage: AccountExportStorage;
};

const STORAGE_NOTE =
  'Progress photographs are not yet a feature of Rebuild, so there are no stored images to ' +
  'include. When they are added, their private storage paths will appear here.';

const DESCRIPTION =
  'A complete, machine-readable export of your Rebuild data. Each key under "data" is a ' +
  'table of your own records exactly as stored. This file contains only your data.';

export type BuildAccountExportInput = {
  userId: string;
  // The moment the export was produced, as an ISO 8601 string. Passed in to keep this pure.
  exportedAtIso: string;
  data: AccountExportInput;
  // The user's own progress-photo storage paths, if any exist (none today). Optional.
  progressPhotoPaths?: readonly string[];
};

export function buildAccountExport(
  input: BuildAccountExportInput,
): AccountExport {
  // Always emit every table key, defaulting to an empty array. This is what makes an empty
  // account a valid, fully-keyed export and guards completeness — a missing table in the
  // input becomes an explicit empty section, never a dropped one.
  const data = {} as Record<ExportedTable, readonly unknown[]>;
  for (const table of EXPORTED_TABLES) {
    data[table] = input.data[table] ?? [];
  }

  return {
    data,
    description: DESCRIPTION,
    exportVersion: ACCOUNT_EXPORT_VERSION,
    exportedAt: input.exportedAtIso,
    storage: {
      note: STORAGE_NOTE,
      progressPhotos: input.progressPhotoPaths ?? [],
    },
    tables: EXPORTED_TABLES,
    userId: input.userId,
  };
}

// Serialise an export to a stable, human-readable JSON string (two-space indent), suitable
// for saving or sharing as a `.json` file.
export function serialiseAccountExport(exportObject: AccountExport): string {
  return JSON.stringify(exportObject, null, 2);
}

// A stable, safe file name for an export, stamped with the export date (YYYY-MM-DD taken from
// the leading 10 chars of the ISO timestamp). Kept pure and deterministic for testing.
export function accountExportFilename(exportObject: AccountExport): string {
  const datePart = exportObject.exportedAt.slice(0, 10);
  return `rebuild-export-${datePart}.json`;
}
