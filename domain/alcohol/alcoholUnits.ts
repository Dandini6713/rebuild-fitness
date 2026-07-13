// Pure alcohol helpers (docs/06 §6.9, docs/03 S-033). No React and no I/O, so they
// unit-test in isolation (mirrors domain/nutrition/nutritionDiary.ts and
// domain/measurements/weightTrend.ts).
//
// TONE IS A HARD CONSTRAINT (docs/07 §7.4, the roadmap-20 brief). This is a NEUTRAL
// tracker: it RECORDS and TOTALS, it never judges or prescribes. Nothing here — and
// nothing built on it — may recommend fasting, meal skipping, dehydration or
// compensatory ("earned") exercise to offset drinking (docs/06 §6.9 forbids this
// explicitly). There is deliberately no "calories burned to offset", no limit-exceeded
// warning and no abstinence praise: the percentage-of-limit figure below is INFORMATION,
// not a cap or a warning. Any output that nudges behaviour would be a bug.
//
// Two responsibilities, both pure:
//   1. computeUnits — the UK-units formula, so a drink's units are derived once from its
//      volume and strength rather than typed by hand.
//   2. summariseAlcoholWeek — total a seven-day window (drinks, units, calories) and count
//      alcohol-free days, reusing the roadmap-19 local-day window so a drink logged just
//      after local midnight belongs to the right local day (never a raw UTC day).

import { dayWindow } from '@/domain/nutrition/nutritionDiary';

// Round to two decimal places (the numeric(6,2) units column / numeric(8,2) volume),
// avoiding binary drift by rounding at the boundary.
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// UK units = volume in millilitres × ABV percentage / 1000 (docs/06 §6.9), where ABV is a
// normal percentage such as 5.0. e.g. 568 ml at 5% ≈ 2.84 units. Rounded to two decimals
// to match the stored units column. Calories are NOT derived here: there is no reliable
// calories-from-ABV formula worth inventing, so calories are user-supplied per drink (the
// field exists on alcohol_logs) — see the schema for the sensible default.
export function computeUnits(volumeMl: number, abvPercent: number): number {
  return round2((volumeMl * abvPercent) / 1000);
}

// The number of days a "week" summary spans. A rolling seven-day window ending on (and
// including) the reference day.
export const DAYS_IN_WEEK = 7;

// One logged drink as the summary reads it: when it was logged (UTC instant) and the two
// stored totals it contributes. Volume/ABV/name are not needed for the summary.
export type DrinkRecord = {
  id: string;
  loggedAtIso: string;
  units: number;
  calories: number;
};

// The weekly summary is EXACTLY the five metrics docs/06 §6.9 lists — no extras that
// would imply judgement. `percentOfLimit` and `weeklyLimitUnits` are null when the user
// has not set a personal limit (the responsible default for alcohol is to invent no
// number), so the UI omits that line rather than showing 0 or a fabricated limit.
export type WeeklyAlcoholSummary = {
  totalDrinks: number;
  totalUnits: number; // rounded to two decimals
  totalCalories: number; // integer sum
  alcoholFreeDays: number; // 0..daysInWindow
  daysInWindow: number;
  weeklyLimitUnits: number | null;
  percentOfLimit: number | null; // whole number; informational, never a cap or warning
};

// Step back `n` whole calendar days from a YYYY-MM-DD date, returning YYYY-MM-DD. Uses
// UTC date arithmetic on the date parts alone (no clock component), so it is immune to
// DST — it is pure calendar counting, not elapsed time.
function shiftIsoDate(dayIso: string, n: number): string {
  const parts = dayIso.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  const shifted = new Date(Date.UTC(year, month - 1, day) - n * 86_400_000);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, '0');
  const d = String(shifted.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// The list of local day (YYYY-MM-DD) strings the summary covers: the reference day and
// the `days - 1` days before it, oldest first. Exposed so the repository can derive the
// query window (the earliest day's local-midnight start to the reference day's end) from
// the same logic, and so tests can assert the exact days.
export function weekDays(
  referenceDayIso: string,
  days: number = DAYS_IN_WEEK,
): string[] {
  const result: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    result.push(shiftIsoDate(referenceDayIso, offset));
  }
  return result;
}

// The UTC window covering the whole seven-day span, from the earliest day's local
// midnight to the reference day's last local millisecond. `offsetMinutes` follows
// Date.getTimezoneOffset() (see dayWindow). Adjacent days abut exactly, so the span has
// no internal gaps — it is the union of the per-day windows.
export function weekWindow(
  referenceDayIso: string,
  offsetMinutes: number,
  days: number = DAYS_IN_WEEK,
): { startIso: string; endIso: string } {
  const daysList = weekDays(referenceDayIso, days);
  const first = daysList[0] ?? referenceDayIso;
  const last = daysList[daysList.length - 1] ?? referenceDayIso;
  return {
    endIso: dayWindow(last, offsetMinutes).endIso,
    startIso: dayWindow(first, offsetMinutes).startIso,
  };
}

// Total the week and count alcohol-free days. Each drink is placed in a LOCAL day via the
// roadmap-19 dayWindow, so a drink logged at 00:30 local belongs to that local day and an
// alcohol-free day is a local day with zero drinks — not a raw UTC day (which would
// mis-assign the drink by the user's UTC offset). `offsetMinutes` follows
// Date.getTimezoneOffset(). `weeklyLimitUnits` is optional: when null/undefined the
// percentage line is omitted entirely (no invented limit). A drink outside the window is
// simply not counted.
export function summariseAlcoholWeek(
  drinks: readonly DrinkRecord[],
  referenceDayIso: string,
  offsetMinutes: number,
  weeklyLimitUnits: number | null = null,
  days: number = DAYS_IN_WEEK,
): WeeklyAlcoholSummary {
  const daysList = weekDays(referenceDayIso, days);
  // Precompute each day's window once, then bucket every drink into a day it falls in.
  const windows = daysList.map((dayIso) => dayWindow(dayIso, offsetMinutes));
  const perDayDrinkCount = new Array<number>(daysList.length).fill(0);

  let totalDrinks = 0;
  let totalUnits = 0;
  let totalCalories = 0;

  for (const drink of drinks) {
    const at = drink.loggedAtIso;
    for (let i = 0; i < windows.length; i += 1) {
      const window = windows[i]!;
      if (at >= window.startIso && at <= window.endIso) {
        perDayDrinkCount[i] = (perDayDrinkCount[i] ?? 0) + 1;
        totalDrinks += 1;
        totalUnits += drink.units;
        totalCalories += drink.calories;
        break; // days abut with no overlap, so a drink lands in exactly one day
      }
    }
  }

  const alcoholFreeDays = perDayDrinkCount.filter(
    (count) => count === 0,
  ).length;

  // Percentage of the personal limit — INFORMATION only (docs/07 §7.4), never a cap or a
  // warning. Present only when a positive limit is set; otherwise the line is omitted so
  // the UI shows no fabricated limit and no 0.
  const hasLimit =
    weeklyLimitUnits !== null &&
    weeklyLimitUnits !== undefined &&
    weeklyLimitUnits > 0;
  const roundedUnits = round2(totalUnits);
  const percentOfLimit = hasLimit
    ? Math.round((roundedUnits / (weeklyLimitUnits as number)) * 100)
    : null;

  return {
    alcoholFreeDays,
    daysInWindow: daysList.length,
    percentOfLimit,
    totalCalories,
    totalDrinks,
    totalUnits: roundedUnits,
    weeklyLimitUnits: hasLimit ? (weeklyLimitUnits as number) : null,
  };
}
