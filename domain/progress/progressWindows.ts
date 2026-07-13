// Windowing for the progress dashboard (roadmap 21, docs/03 S-040): the 4-week and
// 12-week views the brief and docs/09 §9.6 require, split into WEEKLY buckets. Pure, no
// React, no I/O.
//
// Every boundary is a LOCAL calendar day, reusing the roadmap-19 dayWindow so the
// dashboard buckets a reading into exactly the same day the food diary and the alcohol
// summary would (docs: display in the user's time zone). A drink or a log made at 00:30
// local belongs to that local day, not to a raw UTC day one hour earlier. Consecutive
// buckets abut with no gap and no overlap, because dayWindow days abut.

import { dayWindow } from '@/domain/nutrition/nutritionDiary';

// The two views the dashboard offers, in weeks.
export const DASHBOARD_WINDOWS = [4, 12] as const;
export type DashboardWindowWeeks = (typeof DASHBOARD_WINDOWS)[number];

const DAYS_PER_WEEK = 7;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// Step back `n` whole calendar days from a YYYY-MM-DD date, returning YYYY-MM-DD. Pure
// calendar arithmetic on the date parts (no clock component), so it is immune to DST —
// this counts days, it does not measure elapsed time (mirrors alcoholUnits.shiftIsoDate).
function shiftIsoDate(dayIso: string, n: number): string {
  const [year, month, day] = dayIso.split('-').map(Number);
  const shifted = new Date(
    Date.UTC(year ?? 1970, (month ?? 1) - 1, day ?? 1) - n * 86_400_000,
  );
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// A short British day label like "8 Jun" for an axis tick. Deterministic (no locale).
export function formatDayLabel(dayIso: string): string {
  const [, month, day] = dayIso.split('-').map(Number);
  return `${day ?? ''} ${MONTHS[(month ?? 1) - 1] ?? ''}`;
}

// One weekly bucket: the seven local days it spans (inclusive), the UTC instants that
// bound it (for querying timestamp columns), and a short label (its first day).
export type WeekBucket = {
  index: number; // 0 = oldest
  startDay: string; // YYYY-MM-DD, local, inclusive
  endDay: string; // YYYY-MM-DD, local, inclusive
  startIso: string; // UTC instant of the bucket's first local midnight
  endIso: string; // UTC instant of the last millisecond of the bucket's last local day
  label: string;
};

// The `weeks` seven-day buckets ending on (and including) `referenceDayIso`, oldest
// first. Bucket k covers the local days [ref − (weeks−k)·7 + 1 … ref − (weeks−1−k)·7].
// `offsetMinutes` follows Date.getTimezoneOffset() (see dayWindow), passed in so the
// windowing stays pure and testable at any offset.
export function weeklyBuckets(
  referenceDayIso: string,
  weeks: number,
  offsetMinutes: number,
): WeekBucket[] {
  const buckets: WeekBucket[] = [];
  for (let index = 0; index < weeks; index += 1) {
    const weeksBack = weeks - 1 - index;
    const endDay = shiftIsoDate(referenceDayIso, weeksBack * DAYS_PER_WEEK);
    const startDay = shiftIsoDate(endDay, DAYS_PER_WEEK - 1);
    buckets.push({
      endDay,
      endIso: dayWindow(endDay, offsetMinutes).endIso,
      index,
      label: formatDayLabel(startDay),
      startDay,
      startIso: dayWindow(startDay, offsetMinutes).startIso,
    });
  }
  return buckets;
}

// The whole span the buckets cover, as one range: the local-day range and the UTC
// instants, so the repository can fetch every table once over the full window rather
// than per bucket. `startDay`..`endDay` are inclusive local dates; `startIso`..`endIso`
// are the matching UTC instants.
export function windowRange(
  referenceDayIso: string,
  weeks: number,
  offsetMinutes: number,
): {
  startDay: string;
  endDay: string;
  startIso: string;
  endIso: string;
} {
  const startDay = shiftIsoDate(referenceDayIso, weeks * DAYS_PER_WEEK - 1);
  return {
    endDay: referenceDayIso,
    endIso: dayWindow(referenceDayIso, offsetMinutes).endIso,
    startDay,
    startIso: dayWindow(startDay, offsetMinutes).startIso,
  };
}

// True when a local date (YYYY-MM-DD) falls within a bucket's inclusive day range. ISO
// dates compare correctly as strings. Used to bucket date-typed rows (scheduled_date).
export function dayInBucket(dayIso: string, bucket: WeekBucket): boolean {
  return dayIso >= bucket.startDay && dayIso <= bucket.endDay;
}

// True when a UTC instant (an ISO timestamp) falls within a bucket's instant range. Used
// to bucket timestamp-typed rows (logged_at, started_at) on the correct local-day
// boundary. Buckets abut with no overlap, so an instant lands in at most one bucket.
export function instantInBucket(
  instantIso: string,
  bucket: WeekBucket,
): boolean {
  return instantIso >= bucket.startIso && instantIso <= bucket.endIso;
}
