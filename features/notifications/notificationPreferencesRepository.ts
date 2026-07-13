// Server boundary for notification preferences and the data the schedule is computed from
// (roadmap 24, docs/03 S-051). Mirrors features/alcohol: a narrow backend interface keeps
// the composition testable, and a Supabase adapter implements it against the RLS-protected
// profiles row (the six notify_* columns) and the owner-scoped scheduled_sessions /
// body_measurements tables. Every read only ever sees the caller's own rows because RLS
// enforces auth.uid() = user_id.
//
// These are the user's OWN preferences with no safety rule they could violate, so a plain
// owner-scoped UPDATE under the existing profiles RLS is exactly right — no trusted RPC.
// The schedule itself is computed by the pure domain module; nothing safety-critical is
// decided here.

import type { SupabaseClient } from '@supabase/supabase-js';

import type {
  NotificationPreferences,
  NotificationType,
  PlannedSessionInput,
} from '@/domain/notifications/notificationSchedule';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// The raw session row the scheduler needs.
type RawSession = {
  id: string;
  scheduled_date: string;
  session_type: string;
  status: string;
  next_morning_check_expected: boolean;
};

// The data the pure scheduler consumes, gathered from the owner's own rows.
export type ScheduleData = {
  sessions: PlannedSessionInput[];
  // The most recent weight / waist measurement instant (timestamptz ISO), or null. The
  // orchestrator turns these into LOCAL days before feeding the scheduler.
  lastWeighInIso: string | null;
  lastWaistIso: string | null;
};

export const NOTIFICATION_TYPES: NotificationType[] = [
  'sessions',
  'weigh_in',
  'waist',
  'weekly_review',
  'readiness',
  'next_morning',
];

// The profiles columns, one per type. Kept beside NOTIFICATION_TYPES so the mapping is in
// one place.
const PREFERENCE_COLUMN: Record<NotificationType, keyof ProfilePrefsRow> = {
  next_morning: 'notify_next_morning',
  readiness: 'notify_readiness',
  sessions: 'notify_sessions',
  waist: 'notify_waist',
  weekly_review: 'notify_weekly_review',
  weigh_in: 'notify_weigh_in',
};

type ProfilePrefsRow = {
  notify_sessions: boolean;
  notify_weigh_in: boolean;
  notify_waist: boolean;
  notify_weekly_review: boolean;
  notify_readiness: boolean;
  notify_next_morning: boolean;
};

const PREFS_COLUMNS =
  'notify_sessions, notify_weigh_in, notify_waist, notify_weekly_review, notify_readiness, notify_next_morning';

export type NotificationPreferencesBackend = {
  fetchPreferences(): Promise<{
    data: ProfilePrefsRow | null;
    error: BackendError;
  }>;
  updatePreference(
    userId: string,
    column: keyof ProfilePrefsRow,
    value: boolean,
  ): Promise<{ error: BackendError }>;
  fetchSessions(
    startDateIso: string,
    endDateIso: string,
  ): Promise<{ data: RawSession[] | null; error: BackendError }>;
  fetchLastMeasurement(
    measurementType: 'weight' | 'waist',
  ): Promise<{ data: { measured_at: string } | null; error: BackendError }>;
};

// ---- Result shapes ---------------------------------------------------------

export type LoadPreferencesResult =
  | { status: 'ready'; preferences: NotificationPreferences }
  | { status: 'error'; message: string };

export type SavePreferenceResult =
  | { status: 'saved' }
  | { status: 'offline' }
  | { status: 'error'; message: string };

export type LoadScheduleDataResult =
  | { status: 'ready'; data: ScheduleData }
  | { status: 'error'; message: string };

const SAVE_ERROR =
  'We could not save that. Check your connection and try again.';
const READ_ERROR =
  'We could not load your settings. Check your connection and try again.';

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

// All-off preferences: the honest default when there is no profiles row yet, and the base
// every fetched row is merged onto.
export function allOff(): NotificationPreferences {
  return {
    next_morning: false,
    readiness: false,
    sessions: false,
    waist: false,
    weekly_review: false,
    weigh_in: false,
  };
}

function toPreferences(row: ProfilePrefsRow | null): NotificationPreferences {
  const prefs = allOff();
  if (!row) {
    return prefs;
  }
  for (const type of NOTIFICATION_TYPES) {
    prefs[type] = row[PREFERENCE_COLUMN[type]] === true;
  }
  return prefs;
}

// ---- Supabase adapter ------------------------------------------------------

export function createSupabaseNotificationPreferencesBackend(
  client: SupabaseClient<Database>,
): NotificationPreferencesBackend {
  return {
    async fetchLastMeasurement(measurementType) {
      const { data, error } = await client
        .from('body_measurements')
        .select('measured_at')
        .eq('measurement_type', measurementType)
        .order('measured_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return {
        data: data ? { measured_at: data.measured_at } : null,
        error,
      };
    },
    async fetchPreferences() {
      const { data, error } = await client
        .from('profiles')
        .select(PREFS_COLUMNS)
        .maybeSingle();
      return { data: data as ProfilePrefsRow | null, error };
    },
    async fetchSessions(startDateIso, endDateIso) {
      const { data, error } = await client
        .from('scheduled_sessions')
        .select(
          'id, scheduled_date, session_type, status, next_morning_check_expected',
        )
        .gte('scheduled_date', startDateIso)
        .lte('scheduled_date', endDateIso)
        .order('scheduled_date', { ascending: true });
      return { data: data as RawSession[] | null, error };
    },
    async updatePreference(userId, column, value) {
      // A computed-key object does not satisfy the generated Update type's exact-optional
      // shape, so the single-column patch is built and typed explicitly against it (a
      // documented boundary cast, not `any`). `column` is a keyof the notify_* columns, so
      // this only ever writes one boolean preference column.
      const patch = {
        [column]: value,
      } as Database['public']['Tables']['profiles']['Update'];
      const { error } = await client
        .from('profiles')
        .update(patch)
        .eq('user_id', userId);
      return { error };
    },
  };
}

// ---- Composed repository ---------------------------------------------------

export function createNotificationPreferencesRepository(
  backend: NotificationPreferencesBackend,
) {
  return {
    async loadPreferences(): Promise<LoadPreferencesResult> {
      const { data, error } = await backend.fetchPreferences();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      return { preferences: toPreferences(data), status: 'ready' };
    },

    // Toggle exactly one type. Each type is INDEPENDENTLY optional, so this writes one
    // column and never touches the others.
    async setPreference(
      userId: string,
      type: NotificationType,
      value: boolean,
    ): Promise<SavePreferenceResult> {
      const { error } = await backend.updatePreference(
        userId,
        PREFERENCE_COLUMN[type],
        value,
      );
      if (error) {
        return looksOffline(error)
          ? { status: 'offline' }
          : { message: error.message || SAVE_ERROR, status: 'error' };
      }
      return { status: 'saved' };
    },

    // Gather the data the pure scheduler needs. `startDateIso` / `endDateIso` bound the
    // near horizon (the caller passes the LOCAL day range). Sessions from the day before
    // the start are included so a next-morning reminder for yesterday's session is not
    // missed.
    async loadScheduleData(
      startDateIso: string,
      endDateIso: string,
    ): Promise<LoadScheduleDataResult> {
      const sessionsResult = await backend.fetchSessions(
        startDateIso,
        endDateIso,
      );
      if (sessionsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const weighIn = await backend.fetchLastMeasurement('weight');
      if (weighIn.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const waist = await backend.fetchLastMeasurement('waist');
      if (waist.error) {
        return { message: READ_ERROR, status: 'error' };
      }

      const sessions: PlannedSessionInput[] = (sessionsResult.data ?? []).map(
        (row) => ({
          dateIso: row.scheduled_date,
          id: row.id,
          nextMorningExpected: row.next_morning_check_expected === true,
          sessionType: row.session_type,
          status: row.status,
        }),
      );

      return {
        data: {
          lastWaistIso: waist.data?.measured_at ?? null,
          lastWeighInIso: weighIn.data?.measured_at ?? null,
          sessions,
        },
        status: 'ready',
      };
    },
  };
}

export type NotificationPreferencesRepository = ReturnType<
  typeof createNotificationPreferencesRepository
>;
