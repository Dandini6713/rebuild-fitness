import { describe, expect, it } from '@jest/globals';

import {
  ACCOUNT_EXPORT_VERSION,
  accountExportFilename,
  buildAccountExport,
  EXPORTED_TABLES,
  serialiseAccountExport,
} from '@/domain/account/accountExport';

const EXPORTED_AT = '2026-07-14T09:30:00.000Z';
const USER = 'user-123';

describe('buildAccountExport — shape and versioning', () => {
  it('stamps the export format version and the passed-in export time and user', () => {
    const result = buildAccountExport({
      data: {},
      exportedAtIso: EXPORTED_AT,
      userId: USER,
    });
    expect(result.exportVersion).toBe(ACCOUNT_EXPORT_VERSION);
    expect(result.exportedAt).toBe(EXPORTED_AT);
    expect(result.userId).toBe(USER);
    // Self-describing: a description and the list of covered tables travel with the data.
    expect(typeof result.description).toBe('string');
    expect(result.tables).toEqual(EXPORTED_TABLES);
  });

  it('always emits a key for every one of the 27 user-owned tables', () => {
    const result = buildAccountExport({
      data: {},
      exportedAtIso: EXPORTED_AT,
      userId: USER,
    });
    // Completeness is a property of the shape, so a table missing from the app cannot silently
    // vanish from an export.
    expect(Object.keys(result.data).sort()).toEqual(
      [...EXPORTED_TABLES].sort(),
    );
    expect(EXPORTED_TABLES).toHaveLength(27);
  });
});

describe('buildAccountExport — empty account', () => {
  it('produces a valid, fully-keyed export with every section empty', () => {
    const result = buildAccountExport({
      data: {},
      exportedAtIso: EXPORTED_AT,
      userId: USER,
    });
    for (const table of EXPORTED_TABLES) {
      expect(result.data[table]).toEqual([]);
    }
    // The storage section is present and self-describing even though progress photos are
    // unbuilt (docs/05 §5.8) — the requirement is not silently dropped.
    expect(result.storage.progressPhotos).toEqual([]);
    expect(result.storage.note).toMatch(/progress photograph/i);
  });
});

describe('buildAccountExport — faithful passthrough (no cross-user data)', () => {
  it('preserves exactly the rows it is given, per table, inventing and merging nothing', () => {
    const profile = { user_id: USER, display_name: 'Danny' };
    const measurement = { id: 'm1', user_id: USER, value: 80 };
    const result = buildAccountExport({
      data: {
        body_measurements: [measurement],
        profiles: [profile],
      },
      exportedAtIso: EXPORTED_AT,
      userId: USER,
    });
    // The builder is a faithful copy: if the repository fetched only the owner's rows (RLS
    // guarantees it), only the owner's rows appear. It never mixes tables or adds rows.
    expect(result.data.profiles).toEqual([profile]);
    expect(result.data.body_measurements).toEqual([measurement]);
    expect(result.data.nutrition_logs).toEqual([]);
  });

  it('does not include the shared exercises catalogue among the exported tables', () => {
    // `exercises` is shared reference data, not the user's own data.
    expect(EXPORTED_TABLES).not.toContain('exercises');
  });
});

describe('serialiseAccountExport / accountExportFilename', () => {
  it('serialises to indented JSON that round-trips', () => {
    const result = buildAccountExport({
      data: { goals: [{ id: 'g1' }] },
      exportedAtIso: EXPORTED_AT,
      userId: USER,
    });
    const json = serialiseAccountExport(result);
    expect(json).toContain('\n  ');
    expect(JSON.parse(json)).toEqual(result);
  });

  it('names the file with the export date', () => {
    const result = buildAccountExport({
      data: {},
      exportedAtIso: EXPORTED_AT,
      userId: USER,
    });
    expect(accountExportFilename(result)).toBe(
      'rebuild-export-2026-07-14.json',
    );
  });
});
