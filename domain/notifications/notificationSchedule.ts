// Pure local-notification SCHEDULING (roadmap 24, docs/03 S-051). No React, no I/O, no
// expo import — this is the cue DECISION, mirroring the pure/device split of the cardio
// player (domain/training/cardioIntervalPlayer.ts pure vs the device adapter). Given the
// enabled types, the relevant data and a reference `now`, it computes the exact set of
// notifications that SHOULD be scheduled, each a typed descriptor with a LOCAL fire time
// and its NON-SENSITIVE title/body. The device adapter (features/notifications/
// deviceNotificationAdapter.ts) turns descriptors into real OS notifications; it is the
// only part jest cannot verify.
//
// TWO hard rules live here so they are testable in isolation:
//   1. LOCAL DAYS, NEVER RAW UTC. A reminder fires on the user's local calendar day. Fire
//      times are LocalDateTime components (year/month/day/hour/minute) built from the
//      session's local date or from `now`'s local day; the adapter turns each into a Date
//      in the device zone. We never schedule from a raw UTC instant.
//   2. NO SENSITIVE HEALTH DETAILS IN TEXT (docs/07). Every title/body comes from the
//      single reviewed source NOTIFICATION_COPY below — never a weight value, a readiness
//      classification, an Achilles/injury detail, a calorie/target number, or anything a
//      lock-screen observer should not see. The copy is deliberately generic ("Time for
//      today's session", "Weekly check-in ready"). A privacy test scans every generated
//      body for forbidden tokens; treat any health value in copy as a bug.

export type NotificationType =
  | 'sessions'
  | 'weigh_in'
  | 'waist'
  | 'weekly_review'
  | 'readiness'
  | 'next_morning';

// The six per-type switches (one owner-scoped boolean column each on profiles). Each type
// is INDEPENDENTLY optional: turning one on or off never changes another. Absence in this
// record is treated as off.
export type NotificationPreferences = Record<NotificationType, boolean>;

// A local calendar wall-clock time. The adapter builds `new Date(year, month-1, day,
// hour, minute)` from this — a Date in the device's local zone — so we never touch UTC.
export type LocalDateTime = {
  year: number;
  month: number; // 1–12
  day: number; // 1–31
  hour: number; // 0–23
  minute: number; // 0–59
};

// One planned/scheduled session as the scheduler needs it. `dateIso` is the stored
// scheduled_date ('YYYY-MM-DD', already a local calendar day). `status` and
// `nextMorningExpected` come straight from scheduled_sessions.
export type PlannedSessionInput = {
  id: string;
  dateIso: string;
  sessionType: string;
  status: string;
  nextMorningExpected: boolean;
};

export type ScheduleInput = {
  now: Date;
  preferences: NotificationPreferences;
  sessions: PlannedSessionInput[];
  // Most recent weight / waist measurement as a LOCAL day 'YYYY-MM-DD', or null when the
  // user has never logged one. Drives the weigh-in / waist cadence.
  lastWeighInDayIso: string | null;
  lastWaistDayIso: string | null;
  horizonDays?: number;
};

// A single notification the app should have scheduled. `key` is a STABLE identifier: the
// adapter reschedules by cancelling all app notifications and re-applying this set, so a
// recompute never duplicates (keys are unique within a set, asserted below).
export type ScheduledNotification = {
  type: NotificationType;
  key: string;
  fireAt: LocalDateTime;
  title: string;
  body: string;
};

// ---- The single reviewed, auditable copy source ----------------------------
// British English, gentle and non-nagging (docs/07: reminders must never be guilt-inducing
// or expose sensitive health detail). NOTHING here contains a value, a classification, or
// an injury/health specific — only the neutral activity name. This is the one place copy
// lives, so the privacy test has a single surface to guard.
export const NOTIFICATION_COPY: Record<
  NotificationType,
  { title: string; body: string }
> = {
  next_morning: {
    title: 'Morning check-in',
    body: 'When you have a moment, your morning check-in is ready.',
  },
  readiness: {
    title: 'Quick check-in',
    body: 'A short check-in is ready for whenever suits you today.',
  },
  sessions: {
    title: "Today's session",
    body: 'You have a session planned today.',
  },
  waist: {
    title: 'Waist measurement',
    body: 'Whenever it suits, it is time for a waist measurement.',
  },
  weekly_review: {
    title: 'Weekly check-in',
    body: 'Your weekly check-in is ready when you are.',
  },
  weigh_in: {
    title: 'Weigh-in',
    body: 'Whenever it suits, it is time for a weigh-in.',
  },
};

// ---- Fire-time configuration (named, documented, adjustable in one place) ---
// The docs do not prescribe exact reminder times, so these are sensible defaults. Morning
// reminders sit early enough to be seen before the day starts; the readiness prompt is
// earlier than the session reminder so a pre-session check can be done first; the weekly
// review is a calm Sunday evening.
const SESSION_HOUR = 8;
const SESSION_MINUTE = 0;
const READINESS_HOUR = 7; // before the session reminder, so the check comes first
const READINESS_MINUTE = 0;
const NEXT_MORNING_HOUR = 8;
const NEXT_MORNING_MINUTE = 0;
const WEIGH_IN_HOUR = 7;
const WEIGH_IN_MINUTE = 30;
const WAIST_HOUR = 7;
const WAIST_MINUTE = 30;
const REVIEW_HOUR = 18;
const REVIEW_MINUTE = 0;

const WEIGH_IN_INTERVAL_DAYS = 7; // a gentle weekly nudge
const WAIST_INTERVAL_DAYS = 14; // waist changes slowly; fortnightly
const REVIEW_WEEKDAY = 0; // Sunday (0 = Sunday … 6 = Saturday)

const DEFAULT_HORIZON_DAYS = 14;

// Session types that require a pre-session readiness check, mirroring classifySession and
// start_scheduled_session's gating (docs/06 §6.2, roadmap 14): running and demanding
// lower-body strength. Cardio, rest and Achilles-day sessions are never gated.
const GATED_SESSION_TYPES = new Set(['running', 'strength']);

// ---- Small pure date helpers (all derived from inputs, never ambient) ------

function localDay(now: Date): LocalDateTime {
  return {
    year: now.getFullYear(),
    month: now.getMonth() + 1,
    day: now.getDate(),
    hour: 0,
    minute: 0,
  };
}

function parseDayIso(dayIso: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dayIso.split('-').map((part) => Number(part));
  return { year: year ?? 0, month: month ?? 0, day: day ?? 0 };
}

// Build a LocalDateTime for a stored 'YYYY-MM-DD' day at a given wall-clock time.
function atTime(dayIso: string, hour: number, minute: number): LocalDateTime {
  const { year, month, day } = parseDayIso(dayIso);
  return { year, month, day, hour, minute };
}

// Milliseconds for a LocalDateTime, in the device's LOCAL zone (never UTC) — used only to
// order and compare fire times against `now`.
function toLocalMillis(dt: LocalDateTime): number {
  return new Date(
    dt.year,
    dt.month - 1,
    dt.day,
    dt.hour,
    dt.minute,
    0,
    0,
  ).getTime();
}

// Add whole days to a LocalDateTime, keeping the wall-clock time. Date normalises
// month/year rollovers for us.
function addDays(dt: LocalDateTime, days: number): LocalDateTime {
  const rolled = new Date(
    dt.year,
    dt.month - 1,
    dt.day + days,
    dt.hour,
    dt.minute,
    0,
    0,
  );
  return {
    year: rolled.getFullYear(),
    month: rolled.getMonth() + 1,
    day: rolled.getDate(),
    hour: dt.hour,
    minute: dt.minute,
  };
}

function isAfter(dt: LocalDateTime, nowMillis: number): boolean {
  return toLocalMillis(dt) > nowMillis;
}

function isOnOrBefore(dt: LocalDateTime, endMillis: number): boolean {
  return toLocalMillis(dt) <= endMillis;
}

// Every fire time in (now, horizonEnd] on a fixed cadence, anchored either on the last
// occurrence (anchorDayIso + interval) or, when there is no history, on today. Used for
// the weigh-in and waist reminders so they are cadence- and data-aware. A hard cap guards
// against a pathological interval.
function recurringFireTimes(
  anchorDayIso: string | null,
  intervalDays: number,
  hour: number,
  minute: number,
  todayIso: string,
  nowMillis: number,
  horizonEndMillis: number,
): LocalDateTime[] {
  const startDayIso = anchorDayIso
    ? addDaysToDayIso(anchorDayIso, intervalDays)
    : todayIso;
  let fire = atTime(startDayIso, hour, minute);
  // Advance to the first occurrence strictly after `now` (an overdue anchor lands in the
  // past, so we step forward to the next due time rather than firing immediately).
  let guard = 0;
  while (!isAfter(fire, nowMillis) && guard < 1000) {
    fire = addDays(fire, intervalDays);
    guard += 1;
  }
  const out: LocalDateTime[] = [];
  guard = 0;
  while (isOnOrBefore(fire, horizonEndMillis) && guard < 1000) {
    out.push(fire);
    fire = addDays(fire, intervalDays);
    guard += 1;
  }
  return out;
}

function addDaysToDayIso(dayIso: string, days: number): string {
  const { year, month, day } = parseDayIso(dayIso);
  const rolled = new Date(year, month - 1, day + days);
  const y = rolled.getFullYear();
  const m = `${rolled.getMonth() + 1}`.padStart(2, '0');
  const d = `${rolled.getDate()}`.padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The next occurrences of a given weekday at a fixed time, in (now, horizonEnd]. Used for
// the weekly-review reminder.
function weekdayFireTimes(
  weekday: number,
  hour: number,
  minute: number,
  now: Date,
  nowMillis: number,
  horizonEndMillis: number,
): LocalDateTime[] {
  // Days until the next instance of `weekday` from today (0 = today).
  const delta = (weekday - now.getDay() + 7) % 7;
  const today = localDay(now);
  let fire: LocalDateTime = {
    year: today.year,
    month: today.month,
    day: today.day,
    hour,
    minute,
  };
  fire = addDays(fire, delta);
  if (!isAfter(fire, nowMillis)) {
    fire = addDays(fire, 7);
  }
  const out: LocalDateTime[] = [];
  let guard = 0;
  while (isOnOrBefore(fire, horizonEndMillis) && guard < 1000) {
    out.push(fire);
    fire = addDays(fire, 7);
    guard += 1;
  }
  return out;
}

function copyFor(type: NotificationType): { title: string; body: string } {
  return NOTIFICATION_COPY[type];
}

function descriptor(
  type: NotificationType,
  key: string,
  fireAt: LocalDateTime,
): ScheduledNotification {
  const { body, title } = copyFor(type);
  return { body, fireAt, key, title, type };
}

// A planned session is one worth reminding about: still planned (not skipped, cancelled,
// completed or replaced) and not a rest day.
function isRemindableSession(session: PlannedSessionInput): boolean {
  return session.status === 'planned' && session.sessionType !== 'rest';
}

// ---- The scheduler ---------------------------------------------------------

// Compute the full set of notifications that SHOULD be scheduled for the near horizon.
// Only enabled types contribute; a disabled type yields nothing. Every returned fire time
// is strictly after `now` and within the horizon. Keys are unique within the set (the
// adapter replaces the whole set, so uniqueness guarantees no duplicate delivery).
//
// NOTE (declared approach): far-future recurring notifications are heavier than the OS
// scheduling primitives cleanly support and easy to get wrong, so we schedule the NEAR
// HORIZON (default 14 days) and rely on rescheduling on app open (the hook) to keep the
// window filled. This matches the roadmap-24 seam guidance.
export function computeNotificationSchedule(
  input: ScheduleInput,
): ScheduledNotification[] {
  const { lastWaistDayIso, lastWeighInDayIso, now, preferences, sessions } =
    input;
  const horizonDays = input.horizonDays ?? DEFAULT_HORIZON_DAYS;
  const nowMillis = now.getTime();
  const todayIso = toIsoDateLocal(now);
  const horizonEndMillis = toLocalMillis({
    ...addDays(localDay(now), horizonDays),
    hour: 23,
    minute: 59,
  });

  const out: ScheduledNotification[] = [];

  if (preferences.sessions) {
    for (const session of sessions) {
      if (!isRemindableSession(session)) {
        continue;
      }
      const fireAt = atTime(session.dateIso, SESSION_HOUR, SESSION_MINUTE);
      if (
        isAfter(fireAt, nowMillis) &&
        isOnOrBefore(fireAt, horizonEndMillis)
      ) {
        out.push(descriptor('sessions', `sessions:${session.id}`, fireAt));
      }
    }
  }

  if (preferences.readiness) {
    for (const session of sessions) {
      if (
        !isRemindableSession(session) ||
        !GATED_SESSION_TYPES.has(session.sessionType)
      ) {
        continue;
      }
      const fireAt = atTime(session.dateIso, READINESS_HOUR, READINESS_MINUTE);
      if (
        isAfter(fireAt, nowMillis) &&
        isOnOrBefore(fireAt, horizonEndMillis)
      ) {
        out.push(descriptor('readiness', `readiness:${session.id}`, fireAt));
      }
    }
  }

  if (preferences.next_morning) {
    for (const session of sessions) {
      // The flag is set on the (amber) replacement session regardless of its later status,
      // so we do not filter on status here — a next-morning check was expected for it.
      if (!session.nextMorningExpected) {
        continue;
      }
      const morningAfter = atTime(
        addDaysToDayIso(session.dateIso, 1),
        NEXT_MORNING_HOUR,
        NEXT_MORNING_MINUTE,
      );
      if (
        isAfter(morningAfter, nowMillis) &&
        isOnOrBefore(morningAfter, horizonEndMillis)
      ) {
        out.push(
          descriptor(
            'next_morning',
            `next-morning:${session.id}`,
            morningAfter,
          ),
        );
      }
    }
  }

  if (preferences.weigh_in) {
    for (const fireAt of recurringFireTimes(
      lastWeighInDayIso,
      WEIGH_IN_INTERVAL_DAYS,
      WEIGH_IN_HOUR,
      WEIGH_IN_MINUTE,
      todayIso,
      nowMillis,
      horizonEndMillis,
    )) {
      out.push(descriptor('weigh_in', `weigh-in:${fireKey(fireAt)}`, fireAt));
    }
  }

  if (preferences.waist) {
    for (const fireAt of recurringFireTimes(
      lastWaistDayIso,
      WAIST_INTERVAL_DAYS,
      WAIST_HOUR,
      WAIST_MINUTE,
      todayIso,
      nowMillis,
      horizonEndMillis,
    )) {
      out.push(descriptor('waist', `waist:${fireKey(fireAt)}`, fireAt));
    }
  }

  if (preferences.weekly_review) {
    for (const fireAt of weekdayFireTimes(
      REVIEW_WEEKDAY,
      REVIEW_HOUR,
      REVIEW_MINUTE,
      now,
      nowMillis,
      horizonEndMillis,
    )) {
      out.push(
        descriptor('weekly_review', `weekly-review:${fireKey(fireAt)}`, fireAt),
      );
    }
  }

  // Sort by fire time so the set is deterministic (helps tests and reads cleanly), then
  // guarantee unique keys (defensive: the constructions above already avoid collisions).
  out.sort((a, b) => toLocalMillis(a.fireAt) - toLocalMillis(b.fireAt));
  return dedupeByKey(out);
}

function dedupeByKey(
  notifications: ScheduledNotification[],
): ScheduledNotification[] {
  const seen = new Set<string>();
  const out: ScheduledNotification[] = [];
  for (const notification of notifications) {
    if (seen.has(notification.key)) {
      continue;
    }
    seen.add(notification.key);
    out.push(notification);
  }
  return out;
}

function fireKey(dt: LocalDateTime): string {
  const m = `${dt.month}`.padStart(2, '0');
  const d = `${dt.day}`.padStart(2, '0');
  const h = `${dt.hour}`.padStart(2, '0');
  const min = `${dt.minute}`.padStart(2, '0');
  return `${dt.year}-${m}-${d}T${h}:${min}`;
}

// Local 'YYYY-MM-DD' for a Date (same rule as domain/training/todaySession.toIsoDate; kept
// local here so this module has no cross-domain import).
function toIsoDateLocal(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}
