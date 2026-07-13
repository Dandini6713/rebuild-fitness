// Server boundary for alcohol tracking (roadmap 20, docs/03 S-033, docs/05 §5.7,
// docs/06 §6.9). Mirrors features/nutrition and features/measurements: a narrow backend
// interface keeps the composition testable, and a Supabase adapter implements it against
// the RLS-protected, owner-scoped alcohol_logs and drink_favourites tables and the
// profiles personal-limit column. Every read only ever sees the caller's own rows because
// RLS enforces auth.uid() = user_id.
//
// This is a PLAIN owner-scoped logging feature. A drink log is data the user owns with no
// safety rule it could violate (unlike readiness's trusted classifier or the red
// session-start block), so a direct owner-scoped INSERT under RLS is exactly right — there
// is no trusted RPC and none is needed. Zod validation (alcoholSchema.ts) is the boundary
// that keeps malformed numbers out, and units are computed by the pure domain function.
//
// TONE (docs/07 §7.4): the weekly summary is EXACTLY the five docs/06 §6.9 metrics — total
// drinks, total units, estimated calories, alcohol-free days, and percentage of personal
// limit (only when a limit is set). It records and totals; it never judges, warns or
// prescribes, and it never suggests offsetting a drink.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  type DrinkRecord,
  summariseAlcoholWeek,
  weekWindow,
  type WeeklyAlcoholSummary,
} from '@/domain/alcohol/alcoholUnits';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// ---- Raw rows and camelCase records ----------------------------------------

type RawLog = {
  id: string;
  logged_at: string;
  drink_name: string;
  drink_type: string | null;
  volume_ml: number;
  abv_percent: number;
  calories: number;
  units: number;
  occasion_note: string | null;
};
type RawFavourite = {
  id: string;
  drink_name: string;
  drink_type: string | null;
  volume_ml: number;
  abv_percent: number;
  calories: number;
};

export type DrinkLogRecord = {
  id: string;
  loggedAtIso: string;
  drinkName: string;
  drinkType: string | null;
  volumeMl: number;
  abvPercent: number;
  calories: number;
  units: number;
  occasionNote: string | null;
};
export type DrinkFavouriteRecord = {
  id: string;
  drinkName: string;
  drinkType: string | null;
  volumeMl: number;
  abvPercent: number;
  calories: number;
};

// ---- Insert inputs ---------------------------------------------------------

export type DrinkLogInsert = {
  userId: string;
  loggedAtIso: string;
  drinkName: string;
  drinkType: string | null;
  volumeMl: number;
  abvPercent: number;
  calories: number;
  units: number;
  occasionNote: string | null;
};
export type DrinkFavouriteInsert = {
  userId: string;
  drinkName: string;
  drinkType: string | null;
  volumeMl: number;
  abvPercent: number;
  calories: number;
};

export type AlcoholBackend = {
  insertLog(
    input: DrinkLogInsert,
  ): Promise<{ data: { id: string } | null; error: BackendError }>;
  fetchWindowLogs(
    startIso: string,
    endIso: string,
  ): Promise<{ data: RawLog[] | null; error: BackendError }>;
  fetchRecentLogs(
    limit: number,
  ): Promise<{ data: RawLog[] | null; error: BackendError }>;
  fetchFavourites(): Promise<{
    data: RawFavourite[] | null;
    error: BackendError;
  }>;
  insertFavourite(
    input: DrinkFavouriteInsert,
  ): Promise<{ data: { id: string } | null; error: BackendError }>;
  deleteFavourite(id: string): Promise<{ error: BackendError }>;
  // The personal weekly unit limit lives on the caller's own profiles row (nullable — no
  // invented default). A missing profiles row reads as "no limit set".
  fetchWeeklyLimit(): Promise<{ data: number | null; error: BackendError }>;
  updateWeeklyLimit(
    userId: string,
    units: number,
  ): Promise<{ error: BackendError }>;
};

// ---- Result shapes ---------------------------------------------------------

export type SaveResult =
  | { status: 'saved'; id: string }
  // Offline: the write is server-side, so it fails honestly rather than pretending it
  // saved. Nothing is held locally — the user retries when back online (a fuller offline
  // queue is a noted seam, not needed for a plain log).
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type SaveLimitResult =
  | { status: 'saved' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type WeeklyReadModel = {
  summary: WeeklyAlcoholSummary;
  recent: DrinkLogRecord[];
};
export type LoadWeeklyResult =
  | { status: 'ready'; data: WeeklyReadModel }
  | { status: 'error'; message: string };

export type LoadFavouritesResult =
  | { status: 'ready'; data: DrinkFavouriteRecord[] }
  | { status: 'error'; message: string };

export type LoadLimitResult =
  | { status: 'ready'; units: number | null }
  | { status: 'error'; message: string };

const SAVE_ERROR =
  'We could not save that. Check your connection and try again.';
const READ_ERROR =
  'We could not load your drinks. Check your connection and try again.';

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

// ---- Supabase adapter ------------------------------------------------------

const LOG_COLUMNS =
  'id, logged_at, drink_name, drink_type, volume_ml, abv_percent, calories, units, occasion_note';

export function createSupabaseAlcoholBackend(
  client: SupabaseClient<Database>,
): AlcoholBackend {
  return {
    async insertLog(input) {
      const { data, error } = await client
        .from('alcohol_logs')
        .insert({
          abv_percent: input.abvPercent,
          calories: input.calories,
          drink_name: input.drinkName,
          drink_type: input.drinkType,
          logged_at: input.loggedAtIso,
          occasion_note: input.occasionNote,
          units: input.units,
          user_id: input.userId,
          volume_ml: input.volumeMl,
        })
        .select('id')
        .single();
      return { data: data ? { id: data.id } : null, error };
    },
    async fetchWindowLogs(startIso, endIso) {
      const { data, error } = await client
        .from('alcohol_logs')
        .select(LOG_COLUMNS)
        .gte('logged_at', startIso)
        .lte('logged_at', endIso)
        .order('logged_at', { ascending: false });
      return { data: data as RawLog[] | null, error };
    },
    async fetchRecentLogs(limit) {
      const { data, error } = await client
        .from('alcohol_logs')
        .select(LOG_COLUMNS)
        .order('logged_at', { ascending: false })
        .limit(limit);
      return { data: data as RawLog[] | null, error };
    },
    async fetchFavourites() {
      const { data, error } = await client
        .from('drink_favourites')
        .select('id, drink_name, drink_type, volume_ml, abv_percent, calories')
        .order('created_at', { ascending: false });
      return { data: data as RawFavourite[] | null, error };
    },
    async insertFavourite(input) {
      const { data, error } = await client
        .from('drink_favourites')
        .insert({
          abv_percent: input.abvPercent,
          calories: input.calories,
          drink_name: input.drinkName,
          drink_type: input.drinkType,
          user_id: input.userId,
          volume_ml: input.volumeMl,
        })
        .select('id')
        .single();
      return { data: data ? { id: data.id } : null, error };
    },
    async deleteFavourite(id) {
      const { error } = await client
        .from('drink_favourites')
        .delete()
        .eq('id', id);
      return { error };
    },
    async fetchWeeklyLimit() {
      const { data, error } = await client
        .from('profiles')
        .select('weekly_alcohol_unit_limit')
        .maybeSingle();
      if (error) {
        return { data: null, error };
      }
      return { data: data?.weekly_alcohol_unit_limit ?? null, error: null };
    },
    async updateWeeklyLimit(userId, units) {
      const { error } = await client
        .from('profiles')
        .update({ weekly_alcohol_unit_limit: units })
        .eq('user_id', userId);
      return { error };
    },
  };
}

// ---- Mapping helpers -------------------------------------------------------

function toLogRecord(raw: RawLog): DrinkLogRecord {
  return {
    abvPercent: raw.abv_percent,
    calories: raw.calories,
    drinkName: raw.drink_name,
    drinkType: raw.drink_type,
    id: raw.id,
    loggedAtIso: raw.logged_at,
    occasionNote: raw.occasion_note,
    units: raw.units,
    volumeMl: raw.volume_ml,
  };
}
function toFavouriteRecord(raw: RawFavourite): DrinkFavouriteRecord {
  return {
    abvPercent: raw.abv_percent,
    calories: raw.calories,
    drinkName: raw.drink_name,
    drinkType: raw.drink_type,
    id: raw.id,
    volumeMl: raw.volume_ml,
  };
}

// ---- Composed repository ---------------------------------------------------

export function createAlcoholRepository(backend: AlcoholBackend) {
  return {
    // Log a single drink (a manual entry, or one built from a favourite). The caller
    // supplies the already-computed units (from the pure domain function).
    async logDrink(input: DrinkLogInsert): Promise<SaveResult> {
      const { data, error } = await backend.insertLog(input);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return data
        ? { id: data.id, status: 'saved' }
        : { message: SAVE_ERROR, status: 'error' };
    },

    async loadFavourites(): Promise<LoadFavouritesResult> {
      const { data, error } = await backend.fetchFavourites();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      return { data: (data ?? []).map(toFavouriteRecord), status: 'ready' };
    },

    async saveFavourite(input: DrinkFavouriteInsert): Promise<SaveResult> {
      const { data, error } = await backend.insertFavourite(input);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return data
        ? { id: data.id, status: 'saved' }
        : { message: SAVE_ERROR, status: 'error' };
    },

    async deleteFavourite(id: string): Promise<SaveResult> {
      const { error } = await backend.deleteFavourite(id);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return { id, status: 'saved' };
    },

    // The weekly summary (docs/06 §6.9): the seven-day window ending on `referenceDayIso`,
    // totalled and free-day counted through the pure domain function on the user's LOCAL
    // days (offsetMinutes follows Date.getTimezoneOffset()). The personal limit is read
    // from the profile; when null the percentage-of-limit metric is simply omitted.
    async loadWeeklySummary(
      referenceDayIso: string,
      offsetMinutes = 0,
      recentLimit = 20,
    ): Promise<LoadWeeklyResult> {
      const { endIso, startIso } = weekWindow(referenceDayIso, offsetMinutes);
      const logsResult = await backend.fetchWindowLogs(startIso, endIso);
      if (logsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const records = (logsResult.data ?? []).map(toLogRecord);

      const limitResult = await backend.fetchWeeklyLimit();
      if (limitResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }

      const drinks: DrinkRecord[] = records.map((record) => ({
        calories: record.calories,
        id: record.id,
        loggedAtIso: record.loggedAtIso,
        units: record.units,
      }));
      const summary = summariseAlcoholWeek(
        drinks,
        referenceDayIso,
        offsetMinutes,
        limitResult.data,
      );

      return {
        data: { recent: records.slice(0, recentLimit), summary },
        status: 'ready',
      };
    },

    async loadWeeklyLimit(): Promise<LoadLimitResult> {
      const { data, error } = await backend.fetchWeeklyLimit();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      return { status: 'ready', units: data };
    },

    async setWeeklyLimit(
      userId: string,
      units: number,
    ): Promise<SaveLimitResult> {
      const { error } = await backend.updateWeeklyLimit(userId, units);
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return { status: 'saved' };
    },
  };
}

export type AlcoholRepository = ReturnType<typeof createAlcoholRepository>;
