// Orchestrates one reschedule: permission → data → pure schedule → adapter. This is the
// seam between the pure scheduler (domain/notifications/notificationSchedule.ts) and the
// device adapter, and the piece the hook calls whenever preferences change or the app
// opens. It is tested against a MOCK adapter (permission-denied → graceful no-op;
// idempotent reschedule cancels superseded and does not duplicate).
//
// The near-horizon approach: we compute the next `horizonDays` of notifications and apply
// them, cancelling whatever was scheduled before. Re-running is therefore idempotent —
// the adapter clears and re-applies the current set — and rescheduling on app open keeps
// the window filled (far-future recurring scheduling is a declared seam).

import {
  computeNotificationSchedule,
  type NotificationPreferences,
} from '@/domain/notifications/notificationSchedule';
import { toIsoDate } from '@/domain/training/todaySession';

import type { NotificationAdapter } from './notificationAdapter';
import type { NotificationPreferencesRepository } from './notificationPreferencesRepository';

const HORIZON_DAYS = 14;

export type SyncResult =
  // Permission is not granted (denied or not yet asked): nothing scheduled, no error.
  | { status: 'permission-not-granted' }
  // Applied the computed set (count is how many notifications are now scheduled; 0 when
  // every type is off, in which case everything was cancelled).
  | { status: 'applied'; count: number }
  // A data read failed; the previous schedule is left untouched.
  | { status: 'error'; message: string };

function addDaysToDayIso(dayIso: string, days: number): string {
  const [year, month, day] = dayIso.split('-').map((part) => Number(part));
  const rolled = new Date(year ?? 0, (month ?? 1) - 1, (day ?? 1) + days);
  const y = rolled.getFullYear();
  const m = `${rolled.getMonth() + 1}`.padStart(2, '0');
  const d = `${rolled.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function anyEnabled(preferences: NotificationPreferences): boolean {
  return Object.values(preferences).some(Boolean);
}

// Convert a stored measurement instant (timestamptz ISO) to the user's LOCAL day, so the
// weigh-in / waist cadence is anchored on the local day the reading belongs to (never a
// raw UTC day).
function toLocalDay(iso: string | null): string | null {
  return iso ? toIsoDate(new Date(iso)) : null;
}

export async function syncNotifications(params: {
  adapter: NotificationAdapter;
  repository: NotificationPreferencesRepository;
  preferences: NotificationPreferences;
  now: Date;
}): Promise<SyncResult> {
  const { adapter, now, preferences, repository } = params;

  const permission = await adapter.getPermissionStatus();
  if (permission !== 'granted') {
    // Graceful: without permission we schedule nothing and never error.
    return { status: 'permission-not-granted' };
  }

  // Everything off: cancel any lingering notifications and we are done.
  if (!anyEnabled(preferences)) {
    await adapter.cancelAll();
    return { count: 0, status: 'applied' };
  }

  const todayIso = toIsoDate(now);
  // Include the day before today so a next-morning reminder for yesterday's session is not
  // missed; extend to the far edge of the horizon.
  const startDateIso = addDaysToDayIso(todayIso, -1);
  const endDateIso = addDaysToDayIso(todayIso, HORIZON_DAYS);

  const dataResult = await repository.loadScheduleData(
    startDateIso,
    endDateIso,
  );
  if (dataResult.status === 'error') {
    return { message: dataResult.message, status: 'error' };
  }

  const schedule = computeNotificationSchedule({
    horizonDays: HORIZON_DAYS,
    lastWaistDayIso: toLocalDay(dataResult.data.lastWaistIso),
    lastWeighInDayIso: toLocalDay(dataResult.data.lastWeighInIso),
    now,
    preferences,
    sessions: dataResult.data.sessions,
  });

  await adapter.applySchedule(schedule);
  return { count: schedule.length, status: 'applied' };
}
