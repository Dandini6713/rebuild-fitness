// Server boundary for measurement logging (roadmap 18, docs/03 S-034). Mirrors
// features/today and features/readiness: a narrow backend interface keeps the
// composition testable, and a Supabase adapter implements it against the RLS-protected,
// owner-scoped body_measurements table (20260711090300 / 090500). Every read only ever
// sees the caller's own rows because RLS enforces auth.uid() = user_id.
//
// This is a PLAIN owner-scoped logging feature. The client legitimately owns its
// measurements and there is no safety rule it could violate by logging one, so — unlike
// readiness (a trusted definer RPC re-computes the classification) or session start (a
// server-enforced red block) — a direct owner-scoped INSERT under RLS is exactly right.
// There is no trusted RPC, and none is needed.
//
// The read model also computes the weight trend (docs/06 §6.6) from the loaded rows via
// the pure domain engine. Only 'weight' rows feed the trend; 'waist' rows are history
// only (the domain function filters internally).

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  evaluateWeightTrend,
  type TrendMeasurement,
  type WeightTrendResult,
} from '@/domain/measurements/weightTrend';
import type { MeasurementType } from './measurementSchema';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

type RawMeasurement = {
  id: string;
  measurement_type: MeasurementType;
  value: number;
  unit: string;
  measured_at: string;
  conditions_note: string | null;
};

// A plain owner-scoped insert. The caller supplies its own user id (from the session);
// RLS additionally checks auth.uid() = user_id, so a row can only ever be written for
// the signed-in user.
export type MeasurementInsert = {
  userId: string;
  type: MeasurementType;
  value: number;
  unit: string;
  measuredAtIso: string;
  conditionsNote: string | null;
};

export type MeasurementBackend = {
  insert(
    input: MeasurementInsert,
  ): Promise<{ data: { id: string } | null; error: BackendError }>;
  fetchHistory(): Promise<{
    data: RawMeasurement[] | null;
    error: BackendError;
  }>;
};

// One measurement as the history list shows it: the raw logged value, never blended
// with the trend (docs/06 §6.6).
export type MeasurementRecord = {
  id: string;
  type: MeasurementType;
  value: number;
  unit: string;
  measuredAtIso: string;
  conditionsNote: string | null;
};

// The history read model: the raw weight and waist records (most recent first) kept
// SEPARATE from the computed weight trend. The two are presented apart so a trend is
// never mistaken for a measurement.
export type MeasurementHistory = {
  weight: MeasurementRecord[];
  waist: MeasurementRecord[];
  trend: WeightTrendResult;
};

export type LogResult =
  | { status: 'saved'; id: string }
  // Offline: the write is server-side, so it fails honestly rather than pretending it
  // saved. Nothing is held locally — the user simply retries when back online (a fuller
  // offline queue is a noted seam, not needed for a plain measurement).
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type HistoryResult =
  | { status: 'ready'; data: MeasurementHistory }
  | { status: 'error'; message: string };

const SAVE_ERROR =
  'We could not save your measurement. Check your connection and try again.';
const READ_ERROR =
  'We could not load your measurements. Check your connection and try again.';

// A network-shaped failure means the request never reached the server. Anything else is
// a real error the user should see (mirrors features/readiness looksOffline).
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

export function createSupabaseMeasurementBackend(
  client: SupabaseClient<Database>,
): MeasurementBackend {
  return {
    async fetchHistory() {
      const { data, error } = await client
        .from('body_measurements')
        .select(
          'id, measurement_type, value, unit, measured_at, conditions_note',
        )
        .order('measured_at', { ascending: false });
      return { data: data as RawMeasurement[] | null, error };
    },

    async insert(input) {
      const { data, error } = await client
        .from('body_measurements')
        .insert({
          conditions_note: input.conditionsNote,
          measured_at: input.measuredAtIso,
          measurement_type: input.type,
          unit: input.unit,
          user_id: input.userId,
          value: input.value,
        })
        .select('id')
        .single();
      if (error || !data) {
        return { data: null, error };
      }
      return { data: { id: data.id }, error: null };
    },
  };
}

function toRecord(raw: RawMeasurement): MeasurementRecord {
  return {
    conditionsNote: raw.conditions_note,
    id: raw.id,
    measuredAtIso: raw.measured_at,
    type: raw.measurement_type,
    unit: raw.unit,
    value: raw.value,
  };
}

export function createMeasurementRepository(backend: MeasurementBackend) {
  return {
    async log(input: MeasurementInsert): Promise<LogResult> {
      const { data, error } = await backend.insert(input);
      if (error) {
        if (looksOffline(error)) {
          return { status: 'offline' };
        }
        return { message: error.message || SAVE_ERROR, status: 'error' };
      }
      if (!data) {
        return { message: SAVE_ERROR, status: 'error' };
      }
      return { id: data.id, status: 'saved' };
    },

    // Load the history and compute the trend as of `referenceDate` (docs/06 §6.6). The
    // raw records and the trend are returned separately; the view keeps them apart.
    async loadHistory(referenceDate: Date): Promise<HistoryResult> {
      const { data, error } = await backend.fetchHistory();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const rows = data ?? [];
      const weightRecords = rows
        .filter((row) => row.measurement_type === 'weight')
        .map(toRecord);
      const waistRecords = rows
        .filter((row) => row.measurement_type === 'waist')
        .map(toRecord);
      // The trend reads the raw rows; only weight rows feed it (the domain filters).
      const trendInput: TrendMeasurement[] = rows.map((row) => ({
        measuredAt: row.measured_at,
        type: row.measurement_type,
        value: row.value,
      }));
      const trend = evaluateWeightTrend(trendInput, referenceDate);
      return {
        data: { trend, waist: waistRecords, weight: weightRecords },
        status: 'ready',
      };
    },
  };
}

export type MeasurementRepository = ReturnType<
  typeof createMeasurementRepository
>;
