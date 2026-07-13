// The weight-trend rule from docs/06 §6.6, as small pure functions with no React and
// no I/O — the caller passes the measurements and the reference date. It follows the
// §6.1 decision shape (a status, the inputs used and the rule version) and it never
// writes or applies anything; it only computes.
//
// Why a ROBUST ROLLING TREND and not the latest weight (docs/06 §6.6). Body weight
// swings day to day with water, food and time of day, so the newest reading is a poor
// estimate of the underlying trend. This uses a seven-day EXPONENTIALLY WEIGHTED
// moving average: recent readings count for more, older ones fade out with a seven-day
// scale.
//
// The subtle bug this function exists to avoid — MISSING DAYS. Real logging is
// irregular: gaps are the norm, not the exception. A naive per-sample EWMA
// (s = α·x + (1−α)·s_prev with a fixed α per reading) assumes one reading per equal
// time step, so it silently MIS-WEIGHTS when days are skipped and OVER-WEIGHTS a
// cluster of readings taken close together — it cannot even tell two series apart when
// they share the same readings in the same order but have different gaps between them.
//
// So the weight of each reading is derived from its ACTUAL ELAPSED TIME, not its
// position in a list. Each reading r at age a days (measured before the reference
// date) carries weight w = exp(−a / TAU_DAYS). The trend value is the weighted mean of
// the readings (their exponentially-recency-weighted average — the EWMA level at the
// reference date), and the direction/rate is the slope of a time-weighted linear fit
// of weight against time. Both are computed from real timestamps, so skipped days and
// same-day clusters are handled correctly. `weightTrend.test.ts` proves this against a
// naive count-based EWMA.
//
// Data sufficiency gate (docs/06 §6.6). "Do not generate conclusions from fewer than
// three weights in seven days or fewer than six weights across fourteen days." Both
// must hold: at least three weights within the last seven days AND at least six within
// the last fourteen. Below either threshold the function returns an explicit
// insufficient-data result naming which threshold(s) were not met, never a number
// dressed up as a trend.
//
// Only 'weight' measurements feed the trend. 'waist' rows are accepted in the input
// (so a caller can pass a mixed history straight through) but are filtered out and
// never affect the result — proven by test.

export const RULE_VERSION = 'weight-trend/v1';

// The exponential time constant, in days. At an age of TAU_DAYS a reading carries
// weight e⁻¹ ≈ 0.37 of a same-day reading; this is the "seven-day" in the seven-day
// EWMA (docs/06 §6.6).
export const TAU_DAYS = 7;

// The two sufficiency windows and their minimum counts (docs/06 §6.6).
export const SHORT_WINDOW_DAYS = 7;
export const SHORT_WINDOW_MIN_COUNT = 3;
export const LONG_WINDOW_DAYS = 14;
export const LONG_WINDOW_MIN_COUNT = 6;

// A display-only deadband for the direction LABEL: a weekly change smaller than this in
// magnitude reads as "steady" rather than "rising"/"falling". The precise signed
// `changePerWeekKg` is reported separately and is what the calorie-adjustment rules
// (docs/06 §6.7, roadmap 19/22) will consume; this threshold only affects the word.
export const STEADY_THRESHOLD_KG_PER_WEEK = 0.1;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type MeasurementKind = 'weight' | 'waist';

// One measurement as the trend reads it. `value` is kilograms for a weight row (it is
// ignored for waist). `measuredAt` is an ISO timestamp. A mixed list may be passed
// straight from the repository; non-weight rows are filtered out internally.
export type TrendMeasurement = {
  type: MeasurementKind;
  value: number;
  measuredAt: string;
};

export type WeightTrendDirection = 'falling' | 'steady' | 'rising';

// Which sufficiency threshold was not met, for an honest explanation.
export type UnmetThreshold = 'three-in-seven' | 'six-in-fourteen';

// The inputs actually used to reach the result (docs/06 §6.1), for the audit trail and
// for explaining the insufficient-data case. JSON-serialisable, no undefined values.
export type WeightTrendInputs = {
  referenceDateIso: string;
  weightCountConsidered: number; // weight rows on/before the reference date
  countWithinShortWindow: number; // weights within the last 7 days
  countWithinLongWindow: number; // weights within the last 14 days
  tauDays: number;
  shortWindowDays: number;
  shortWindowMinCount: number;
  longWindowDays: number;
  longWindowMinCount: number;
};

export type WeightTrendResult =
  // Not enough data to conclude anything. The raw weights should still be shown; this
  // says which threshold is unmet so the UI can explain what to log to unlock a trend.
  | {
      status: 'insufficient-data';
      unmetThresholds: UnmetThreshold[];
      inputs: WeightTrendInputs;
      ruleVersion: string;
    }
  // A trend is available. `trendKg` is the smoothed weight (the EWMA level) at the
  // reference date — a robust estimate, NOT the latest reading. `changePerWeekKg` is
  // the signed weekly rate from the time-weighted fit; `direction` is its label.
  | {
      status: 'trend';
      trendKg: number;
      direction: WeightTrendDirection;
      changePerWeekKg: number;
      inputs: WeightTrendInputs;
      ruleVersion: string;
    };

type AgedReading = {
  value: number;
  ageDays: number; // >= 0, measured before or at the reference date
  weight: number; // exp(-ageDays / TAU_DAYS)
};

// Weight rows on or before the reference date, with their age in days and exponential
// weight. Future-dated rows (after the reference date) and non-weight rows are
// excluded. Order is irrelevant to the maths, so out-of-order input is handled.
function agedWeightReadings(
  measurements: readonly TrendMeasurement[],
  referenceDate: Date,
): AgedReading[] {
  const referenceMs = referenceDate.getTime();
  const readings: AgedReading[] = [];
  for (const measurement of measurements) {
    if (measurement.type !== 'weight') {
      continue;
    }
    const measuredMs = new Date(measurement.measuredAt).getTime();
    if (!Number.isFinite(measuredMs) || !Number.isFinite(measurement.value)) {
      continue;
    }
    const ageDays = (referenceMs - measuredMs) / MS_PER_DAY;
    if (ageDays < 0) {
      // A reading after the reference date is not yet part of "up to now".
      continue;
    }
    readings.push({
      ageDays,
      value: measurement.value,
      weight: Math.exp(-ageDays / TAU_DAYS),
    });
  }
  return readings;
}

// The EWMA level: the exponentially-recency-weighted mean of the readings. This is the
// robust "current smoothed weight" the trend reports.
function weightedMean(readings: readonly AgedReading[]): number {
  let sumW = 0;
  let sumWV = 0;
  for (const reading of readings) {
    sumW += reading.weight;
    sumWV += reading.weight * reading.value;
  }
  return sumWV / sumW;
}

// The signed weekly rate of change, from a time-weighted least-squares fit of value
// against time (t = −ageDays, so more recent = larger t and a positive slope means
// weight is rising over time). Returns 0 when the readings share effectively one
// instant (no time spread to fit a slope through), e.g. a same-day cluster.
function weightedWeeklyChange(readings: readonly AgedReading[]): number {
  let sumW = 0;
  let sumWt = 0;
  let sumWv = 0;
  for (const reading of readings) {
    const t = -reading.ageDays;
    sumW += reading.weight;
    sumWt += reading.weight * t;
    sumWv += reading.weight * reading.value;
  }
  const meanT = sumWt / sumW;
  const meanV = sumWv / sumW;
  let sxx = 0;
  let sxy = 0;
  for (const reading of readings) {
    const dt = -reading.ageDays - meanT;
    sxx += reading.weight * dt * dt;
    sxy += reading.weight * dt * (reading.value - meanV);
  }
  if (sxx < 1e-9) {
    return 0;
  }
  const slopePerDay = sxy / sxx;
  return slopePerDay * 7;
}

function directionOf(changePerWeekKg: number): WeightTrendDirection {
  if (Math.abs(changePerWeekKg) < STEADY_THRESHOLD_KG_PER_WEEK) {
    return 'steady';
  }
  return changePerWeekKg < 0 ? 'falling' : 'rising';
}

// Evaluate the weight trend as of `referenceDate` (docs/06 §6.6). Pure: it reads only
// the measurements and the date, and returns either a trend or an honest
// insufficient-data result. It never applies anything.
export function evaluateWeightTrend(
  measurements: readonly TrendMeasurement[],
  referenceDate: Date,
): WeightTrendResult {
  const readings = agedWeightReadings(measurements, referenceDate);

  const countWithinShortWindow = readings.filter(
    (reading) => reading.ageDays <= SHORT_WINDOW_DAYS,
  ).length;
  const countWithinLongWindow = readings.filter(
    (reading) => reading.ageDays <= LONG_WINDOW_DAYS,
  ).length;

  const inputs: WeightTrendInputs = {
    countWithinLongWindow,
    countWithinShortWindow,
    longWindowDays: LONG_WINDOW_DAYS,
    longWindowMinCount: LONG_WINDOW_MIN_COUNT,
    referenceDateIso: referenceDate.toISOString(),
    shortWindowDays: SHORT_WINDOW_DAYS,
    shortWindowMinCount: SHORT_WINDOW_MIN_COUNT,
    tauDays: TAU_DAYS,
    weightCountConsidered: readings.length,
  };

  const unmetThresholds: UnmetThreshold[] = [];
  if (countWithinShortWindow < SHORT_WINDOW_MIN_COUNT) {
    unmetThresholds.push('three-in-seven');
  }
  if (countWithinLongWindow < LONG_WINDOW_MIN_COUNT) {
    unmetThresholds.push('six-in-fourteen');
  }
  if (unmetThresholds.length > 0) {
    return {
      inputs,
      ruleVersion: RULE_VERSION,
      status: 'insufficient-data',
      unmetThresholds,
    };
  }

  // The trend is computed from the readings inside the fourteen-day sufficiency
  // window: those are the readings we have deemed dense enough to conclude from, and
  // the seven-day exponential weighting already fades the older half of them. Readings
  // older than fourteen days do not pull on the current trend.
  const windowReadings = readings.filter(
    (reading) => reading.ageDays <= LONG_WINDOW_DAYS,
  );
  const trendKg = weightedMean(windowReadings);
  const changePerWeekKg = weightedWeeklyChange(windowReadings);

  return {
    changePerWeekKg,
    direction: directionOf(changePerWeekKg),
    inputs,
    ruleVersion: RULE_VERSION,
    status: 'trend',
    trendKg,
  };
}
