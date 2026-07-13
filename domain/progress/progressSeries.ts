// Per-series assembly for the progress dashboard (roadmap 21, docs/03 S-040). Pure, no
// React, no I/O: each function takes the raw rows the repository loaded plus the window,
// and returns a normalised series the view draws. This is a READ-ONLY display layer — it
// computes no rules and proposes nothing; it reuses the engines other roadmaps own
// (weightTrend for weight; computeUnits/stored units for alcohol; computeWeeklyAdherence
// shape for adherence) and reads everything else as plain totals.
//
// SPARSE DATA IS HANDLED HONESTLY for every series, modelled on the weightTrend
// insufficient-data discipline: below a stated minimum a series reports `hasData: false`
// (or, for weight, the engine's own insufficient-data result) and the tile shows the raw
// points with an honest "not enough logged yet" message — never a fabricated trend. The
// raw points are always available separately from any summary, so a smoothed figure is
// never mistaken for a reading (docs/09 §9.6).

import {
  evaluateWeightTrend,
  type TrendMeasurement,
  type WeightTrendResult,
} from '@/domain/measurements/weightTrend';
import {
  dayInBucket,
  instantInBucket,
  type WeekBucket,
} from './progressWindows';

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// A weekly bar: its label, and its value (null when the week has no basis for a value at
// all — distinct from a real zero, so the view draws it as absent rather than as an empty
// achievement).
export type WeeklyBar = {
  index: number;
  label: string;
  startDay: string;
  value: number | null;
};

// One raw measurement reading, placed horizontally across the window (xFraction) so the
// scatter can position it without re-deriving time. yFraction comes from the chart scale
// in the view, keeping the axis choice in chartScale.ts.
export type TrendPoint = {
  atIso: string;
  value: number;
  xFraction: number;
};

const DAYS_PER_WEEK = 7;

// ---------------------------------------------------------------------------
// Weight trend (docs/06 §6.6) — reuses the versioned engine; raw dots + trend line.
// ---------------------------------------------------------------------------

export type WeightSeries = {
  points: TrendPoint[];
  // The engine's result: a smoothed trend, or an honest insufficient-data result naming
  // which threshold is unmet. The dashboard PRESENTS it, it does not re-derive it.
  trend: WeightTrendResult;
  hasData: boolean;
};

export type MeasurementRow = {
  type: 'weight' | 'waist';
  value: number;
  atIso: string;
};

function placePoints(
  rows: readonly { value: number; atIso: string }[],
  startIso: string,
  endIso: string,
): TrendPoint[] {
  const startMs = new Date(startIso).getTime();
  const endMs = new Date(endIso).getTime();
  const span = endMs - startMs || 1;
  return rows
    .filter((row) => Number.isFinite(new Date(row.atIso).getTime()))
    .map((row) => {
      const ms = new Date(row.atIso).getTime();
      const xFraction = Math.min(1, Math.max(0, (ms - startMs) / span));
      return { atIso: row.atIso, value: row.value, xFraction };
    })
    .sort((a, b) => a.xFraction - b.xFraction);
}

export function assembleWeightSeries(
  measurements: readonly MeasurementRow[],
  window: { startIso: string; endIso: string },
  referenceDate: Date,
): WeightSeries {
  const weights = measurements.filter((row) => row.type === 'weight');
  const inWindow = weights.filter(
    (row) => row.atIso >= window.startIso && row.atIso <= window.endIso,
  );
  const points = placePoints(inWindow, window.startIso, window.endIso);
  // The trend engine reads ALL loaded weights against the reference date (it applies its
  // own 7/14-day sufficiency windows); the scatter shows only readings within the view's
  // window. Both come from the same rows.
  const trendInput: TrendMeasurement[] = weights.map((row) => ({
    measuredAt: row.atIso,
    type: 'weight',
    value: row.value,
  }));
  return {
    hasData: points.length > 0,
    points,
    trend: evaluateWeightTrend(trendInput, referenceDate),
  };
}

// ---------------------------------------------------------------------------
// Waist — history only (roadmap 18). Raw scatter + a simple, gated windowed change.
// ---------------------------------------------------------------------------

// Waist has no smoothing engine (docs treats it as history); the honest summary is the
// change between the first and last reading in the window, and only when there are at
// least two readings to draw a line between. Below that it is insufficient.
export const WAIST_MIN_READINGS = 2;

export type WaistChange =
  | { status: 'insufficient'; count: number }
  | { status: 'available'; changeCm: number; count: number; spanDays: number };

export type WaistSeries = {
  points: TrendPoint[];
  change: WaistChange;
  hasData: boolean;
};

export function assembleWaistSeries(
  measurements: readonly MeasurementRow[],
  window: { startIso: string; endIso: string },
): WaistSeries {
  const waist = measurements.filter(
    (row) =>
      row.type === 'waist' &&
      row.atIso >= window.startIso &&
      row.atIso <= window.endIso,
  );
  const points = placePoints(waist, window.startIso, window.endIso);
  let change: WaistChange;
  if (points.length < WAIST_MIN_READINGS) {
    change = { count: points.length, status: 'insufficient' };
  } else {
    const first = points[0]!;
    const last = points[points.length - 1]!;
    const spanDays = round1(
      (new Date(last.atIso).getTime() - new Date(first.atIso).getTime()) /
        86_400_000,
    );
    change = {
      changeCm: round1(last.value - first.value),
      count: points.length,
      spanDays,
      status: 'available',
    };
  }
  return { change, hasData: points.length > 0, points };
}

// ---------------------------------------------------------------------------
// Session adherence — completed vs planned training sessions per week.
// ---------------------------------------------------------------------------

export type SessionRow = {
  id: string;
  sessionType: string;
  status: string;
  scheduledDate: string; // YYYY-MM-DD local
};
export type WorkoutLogRow = {
  scheduledSessionId: string | null;
  status: string;
};

// A 'replaced' original (an amber substitution, roadmap 15) is superseded by its
// replacement and is not something to adhere to; a 'rest' day is not either. This mirrors
// computeWeeklyAdherence's filtering, applied per bucket.
function isAdherenceRelevant(session: SessionRow): boolean {
  return session.status !== 'replaced' && session.sessionType !== 'rest';
}

export type AdherenceSeries = {
  bars: WeeklyBar[]; // completion percentage per week, null when nothing was planned
  totalPlanned: number;
  totalCompleted: number;
  hasData: boolean; // at least one week had a planned training session
};

export function assembleAdherenceSeries(
  sessions: readonly SessionRow[],
  logs: readonly WorkoutLogRow[],
  buckets: readonly WeekBucket[],
): AdherenceSeries {
  const completedIds = new Set(
    logs
      .filter((log) => log.status === 'completed' && log.scheduledSessionId)
      .map((log) => log.scheduledSessionId as string),
  );
  let totalPlanned = 0;
  let totalCompleted = 0;

  const bars: WeeklyBar[] = buckets.map((bucket) => {
    const planned = sessions.filter(
      (session) =>
        isAdherenceRelevant(session) &&
        dayInBucket(session.scheduledDate, bucket),
    );
    const completed = planned.filter((session) => completedIds.has(session.id));
    totalPlanned += planned.length;
    totalCompleted += completed.length;
    return {
      index: bucket.index,
      label: bucket.label,
      startDay: bucket.startDay,
      // Null when nothing was planned that week, so the view shows a gap (not a
      // misleading 0 %) — the same honesty as computeWeeklyAdherence's null percent.
      value:
        planned.length === 0
          ? null
          : Math.round((completed.length / planned.length) * 100),
    };
  });

  return {
    bars,
    hasData: totalPlanned > 0,
    totalCompleted,
    totalPlanned,
  };
}

// ---------------------------------------------------------------------------
// Strength — completed strength sessions per week.
// ---------------------------------------------------------------------------

export type StrengthSeries = {
  bars: WeeklyBar[]; // count of completed strength sessions per week
  total: number;
  hasData: boolean;
};

// Strength "improvement" as a display metric is the count of completed strength sessions
// (session_type 'strength', which in the current plan IS demanding lower-body — the
// classifySession seam). A per-set volume metric would need the exercise_logs/set_logs
// join and is not built here; the accepted-increase engine (roadmap 12) is a separate
// surface. Sessions are bucketed by their scheduled_date, consistent with adherence.
export function assembleStrengthSeries(
  sessions: readonly SessionRow[],
  logs: readonly WorkoutLogRow[],
  buckets: readonly WeekBucket[],
): StrengthSeries {
  const completedIds = new Set(
    logs
      .filter((log) => log.status === 'completed' && log.scheduledSessionId)
      .map((log) => log.scheduledSessionId as string),
  );
  let total = 0;
  const bars: WeeklyBar[] = buckets.map((bucket) => {
    const count = sessions.filter(
      (session) =>
        session.sessionType === 'strength' &&
        session.status !== 'replaced' &&
        completedIds.has(session.id) &&
        dayInBucket(session.scheduledDate, bucket),
    ).length;
    total += count;
    return {
      index: bucket.index,
      label: bucket.label,
      startDay: bucket.startDay,
      value: count,
    };
  });
  return { bars, hasData: total > 0, total };
}

// ---------------------------------------------------------------------------
// Cardio — completed cardio minutes per week.
// ---------------------------------------------------------------------------

export type CardioLogRow = {
  startedAtIso: string;
  durationSeconds: number | null;
  status: string;
};

export type CardioSeries = {
  bars: WeeklyBar[]; // whole minutes per week
  totalMinutes: number;
  hasData: boolean;
};

export function assembleCardioSeries(
  logs: readonly CardioLogRow[],
  buckets: readonly WeekBucket[],
): CardioSeries {
  let totalMinutes = 0;
  const bars: WeeklyBar[] = buckets.map((bucket) => {
    let seconds = 0;
    for (const log of logs) {
      if (
        log.status === 'completed' &&
        log.durationSeconds &&
        log.durationSeconds > 0 &&
        instantInBucket(log.startedAtIso, bucket)
      ) {
        seconds += log.durationSeconds;
      }
    }
    const minutes = Math.round(seconds / 60);
    totalMinutes += minutes;
    return {
      index: bucket.index,
      label: bucket.label,
      startDay: bucket.startDay,
      value: minutes,
    };
  });
  return { bars, hasData: totalMinutes > 0, totalMinutes };
}

// ---------------------------------------------------------------------------
// Protein — average daily protein per week, against the current target.
// ---------------------------------------------------------------------------

export type NutritionLogRow = { loggedAtIso: string; proteinG: number };

export type ProteinSeries = {
  bars: WeeklyBar[]; // average grams per day across the week's seven days
  // The current protein target as a reference line, or null when none is set (never a
  // fabricated default here — the target resolver owns the default).
  targetG: number | null;
  averagePerDay: number | null; // over the whole window, null when nothing logged
  hasData: boolean;
};

export function assembleProteinSeries(
  logs: readonly NutritionLogRow[],
  buckets: readonly WeekBucket[],
  targetG: number | null,
): ProteinSeries {
  let windowTotal = 0;
  let anyLogged = false;
  const bars: WeeklyBar[] = buckets.map((bucket) => {
    let sum = 0;
    let logged = false;
    for (const log of logs) {
      if (instantInBucket(log.loggedAtIso, bucket)) {
        sum += log.proteinG;
        logged = true;
      }
    }
    if (logged) {
      anyLogged = true;
      windowTotal += sum;
    }
    return {
      index: bucket.index,
      label: bucket.label,
      startDay: bucket.startDay,
      // Average grams per DAY across the seven-day week (an unlogged day counts as zero,
      // which is the honest daily average). Null only when nothing at all was logged that
      // week, so the view shows a gap rather than a 0 that could read as "logged zero".
      value: logged ? round1(sum / DAYS_PER_WEEK) : null,
    };
  });
  const totalDays = buckets.length * DAYS_PER_WEEK;
  return {
    averagePerDay: anyLogged ? round1(windowTotal / totalDays) : null,
    bars,
    hasData: anyLogged,
    targetG,
  };
}

// ---------------------------------------------------------------------------
// Lager / alcohol — units per week. NEUTRAL: totals only, never a judgement.
// ---------------------------------------------------------------------------

export type AlcoholLogRow = { loggedAtIso: string; units: number };

// A NEUTRAL tracker (docs/07 §7.4, docs/06 §6.9): this reports units logged per week and
// nothing else. There is deliberately no limit warning, no "free day" scoring here and —
// critically — NO compensatory logic of any kind. It totals; it does not prescribe.
export type LagerSeries = {
  bars: WeeklyBar[]; // units per week (two decimals)
  totalUnits: number;
  hasData: boolean;
};

export function assembleLagerSeries(
  logs: readonly AlcoholLogRow[],
  buckets: readonly WeekBucket[],
): LagerSeries {
  let totalUnits = 0;
  const bars: WeeklyBar[] = buckets.map((bucket) => {
    let units = 0;
    let any = false;
    for (const log of logs) {
      if (instantInBucket(log.loggedAtIso, bucket)) {
        units += log.units;
        any = true;
      }
    }
    totalUnits += units;
    return {
      index: bucket.index,
      label: bucket.label,
      startDay: bucket.startDay,
      // A week with drinks shows its unit total; a week with none shows a real 0 (an
      // alcohol-free week is information, not absence of the metric).
      value: any ? round2(units) : 0,
    };
  });
  return { bars, hasData: totalUnits > 0, totalUnits: round2(totalUnits) };
}
