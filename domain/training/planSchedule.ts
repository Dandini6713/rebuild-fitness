// Pure helpers for the private twelve-week plan. The plan *content* — the
// templates, their exercises and the weekly pattern — is canonical persona data
// and lives server-side in the seed_private_plan function (see the migration and
// the reference at the bottom of supabase/seed.sql). This module owns only the
// small, testable decisions the client makes around it: when the plan starts,
// and the British-English labels used to render the seeded schedule.
//
// No React and no I/O here, so it is safe to unit test in isolation.

export const PLAN_WEEK_COUNT = 12;
export const PLAN_PREVIEW_WEEKS = 4;

// The session types the seed writes. Kept in lockstep with seed_private_plan;
// the function remains the source of truth for what is actually stored.
export const PLAN_SESSION_TYPES = [
  'strength',
  'cardio',
  'achilles',
  'rest',
] as const;
export type PlanSessionType = (typeof PLAN_SESSION_TYPES)[number];

export const PLAN_SESSION_TYPE_LABELS: Record<PlanSessionType, string> = {
  strength: 'Strength',
  cardio: 'Cardio',
  achilles: 'Achilles strength and mobility',
  rest: 'Rest day',
};

// A session may arrive with an unexpected type if the schema grows ahead of this
// map; fall back to a readable version rather than showing a raw slug.
export function describeSessionType(sessionType: string): string {
  if ((PLAN_SESSION_TYPES as readonly string[]).includes(sessionType)) {
    return PLAN_SESSION_TYPE_LABELS[sessionType as PlanSessionType];
  }
  return sessionType.replace(/[_-]+/g, ' ');
}

// The canonical Monday–Sunday pattern the seed lays down, mirrored here for
// documentation and tests. Index 0 is Monday.
export const DEFAULT_WEEKLY_PATTERN: readonly PlanSessionType[] = [
  'strength', // Monday: Strength A
  'cardio', // Tuesday: brisk walk, bike or cross-trainer
  'achilles', // Wednesday: Achilles strength and mobility
  'strength', // Thursday: Strength B
  'cardio', // Friday: walk or later run-walk
  'cardio', // Saturday: longer walk or second cardio
  'rest', // Sunday: rest
] as const;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}/;

// Resolve the plan start date from the moment onboarding is confirmed. The
// persona pattern is anchored to weekdays — Strength A on Monday, Strength B on
// Thursday — so the plan begins on the first Monday on or after the confirmation
// date. Dates are handled in UTC (AGENTS.md) for deterministic behaviour.
//
// Mapping the schedule onto a user's *chosen* training days is deliberately not
// done here. Done correctly it has to respect the weekly safety rules in
// docs/06 §6.5 (no consecutive demanding sessions, a guaranteed rest day) and
// overlaps activity swapping (roadmap 15). For now onboarding availability sets
// only this start date; the seam is noted in CLAUDE.md.
export function resolvePlanStartDate(confirmedAtIso: string): string {
  const from = new Date(confirmedAtIso);
  if (Number.isNaN(from.getTime())) {
    throw new Error(`Invalid confirmation date: ${confirmedAtIso}`);
  }
  // getUTCDay: 0 Sunday … 6 Saturday. Days until the next Monday (0 if already
  // Monday) is ((1 - day) + 7) mod 7.
  const daysUntilMonday = (1 - from.getUTCDay() + 7) % 7;
  const start = new Date(
    Date.UTC(
      from.getUTCFullYear(),
      from.getUTCMonth(),
      from.getUTCDate() + daysUntilMonday,
    ),
  );
  return start.toISOString().slice(0, 10);
}

// The Monday–Sunday range containing a plain calendar date, returned as inclusive
// YYYY-MM-DD bounds. Today's queries and the weekly adherence figure are scoped to
// this window. Parsed at UTC midnight so a plain date's weekday never shifts with
// the device time zone (mirrors formatPlanDate). The persona week starts on Monday
// (Strength A), so the range does too.
export function currentWeekRange(isoDate: string): {
  end: string;
  start: string;
} {
  const base = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(base.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  // getUTCDay: 0 Sunday … 6 Saturday. Days since Monday is (day + 6) mod 7.
  const daysSinceMonday = (base.getUTCDay() + 6) % 7;
  const start = new Date(
    Date.UTC(
      base.getUTCFullYear(),
      base.getUTCMonth(),
      base.getUTCDate() - daysSinceMonday,
    ),
  );
  const end = new Date(
    Date.UTC(
      start.getUTCFullYear(),
      start.getUTCMonth(),
      start.getUTCDate() + 6,
    ),
  );
  return {
    end: end.toISOString().slice(0, 10),
    start: start.toISOString().slice(0, 10),
  };
}

const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

// Formats a stored YYYY-MM-DD date as, for example, "Monday 3 August". Parsed in
// UTC so a plain calendar date never shifts across the device's time zone.
export function formatPlanDate(isoDate: string): string {
  if (!ISO_DATE.test(isoDate)) {
    return isoDate;
  }
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    return isoDate;
  }
  const weekday = WEEKDAY_NAMES[date.getUTCDay()];
  const month = MONTH_NAMES[date.getUTCMonth()];
  return `${weekday} ${date.getUTCDate()} ${month}`;
}
