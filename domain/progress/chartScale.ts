// The load-bearing part of the progress dashboard (roadmap 21, docs/03 S-040, docs/09
// §9.6). Everything here is a small pure function with no React and no SVG: it turns a
// set of values into an AXIS and a set of 0..1 fractions the drawing layer positions
// blindly. Separating the scale from the drawing is deliberate — this is where "do not
// truncate the vertical axis in a misleading way" (docs/09 §9.6) is actually ENFORCED,
// so it is the tested module, not the pixels.
//
// Two kinds of scale, because the honest baseline differs:
//
//   1. computeBarScale — for series where ZERO IS MEANINGFUL (a count of sessions, a
//      sum of units, minutes, a percentage). The baseline is ALWAYS exactly zero. A bar
//      whose height is proportional to its value only reads truthfully from a zero
//      baseline; starting the axis anywhere else would exaggerate differences. So these
//      scales cannot produce a truncated axis at all — the baseline is a literal 0.
//
//   2. computePointScale — for a MEASUREMENT TREND (body weight, waist) where a zero
//      baseline genuinely hides all signal: nobody's weight varies from 0, so a
//      0–90 kg axis flattens a real 2 kg move into nothing. Here a non-zero baseline is
//      the honest choice, but a non-zero baseline is ALSO how misleading charts lie. The
//      resolution: the baseline is chosen to sit BELOW the lowest reading (never clipping
//      a point) and is returned as data (`baseline`, `baselineIsZero`) so the view is
//      OBLIGED to label it. There is no way to emit a silently-truncated axis — the
//      baseline value always travels with the scale and `baselineIsZero` says plainly
//      whether it is zero.
//
// Sparse data is a first-class case (the dashboard's other hard constraint): an empty
// series yields an empty scale (the tile shows "not enough data yet", never a fabricated
// line), and a SINGLE point is centred (fraction ≈ 0.5) inside a symmetric band rather
// than pinned to the floor or ceiling, so one reading never looks like a trend.

// Round to `dp` decimal places, killing binary-float noise so ticks and baselines are
// clean numbers (e.g. 74.00000001 → 74).
function roundTo(value: number, dp: number): number {
  const factor = 10 ** dp;
  return Math.round(value * factor) / factor;
}

// A "nice" step for an axis of roughly `targetTicks` intervals across `range`: 1, 2, 5
// times a power of ten. Deterministic and dependency-free. `range` must be > 0.
function niceStep(range: number, targetTicks: number): number {
  const raw = range / targetTicks;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const normalised = raw / magnitude;
  let step: number;
  if (normalised < 1.5) {
    step = 1;
  } else if (normalised < 3) {
    step = 2;
  } else if (normalised < 7) {
    step = 5;
  } else {
    step = 10;
  }
  return step * magnitude;
}

// Evenly spaced ticks from `from` to `to` inclusive at `step`, cleaned of float noise.
function ticksBetween(from: number, to: number, step: number): number[] {
  const ticks: number[] = [];
  // A generous guard against a pathological step; real inputs give a handful of ticks.
  const maxTicks = 1000;
  for (let i = 0; i <= maxTicks; i += 1) {
    const value = roundTo(from + i * step, 6);
    if (value > to + step / 1000) {
      break;
    }
    ticks.push(value);
  }
  return ticks;
}

// ---------------------------------------------------------------------------
// Bar scale (zero baseline, always)
// ---------------------------------------------------------------------------

export type BarScale = {
  // Always 0 — bars are only truthful from a zero baseline.
  baseline: 0;
  // The top of the axis, a nice number ≥ every value (and ≥ referenceValue).
  max: number;
  // Axis ticks from 0 to `max`, for optional gridlines/labels.
  ticks: number[];
  // One fraction (0..1) per input value, in input order. A null input (a bucket with no
  // data, distinct from a real zero) stays null so the view can render it as absent
  // rather than as a zero-height bar that implies "logged nothing".
  fractions: (number | null)[];
  // The reference value (e.g. a protein target) as a fraction of `max`, or null when
  // none was given, so the view can draw a target line at the right height.
  referenceFraction: number | null;
};

export type BarScaleOptions = {
  // A value the axis must be able to show even if no bar reaches it — e.g. a protein
  // target, so a week under target does not stretch to the top and read as "at target".
  referenceValue?: number;
  // The smallest sensible axis top, so a series of tiny values (one session) still has a
  // calm axis rather than a single full-height bar. Defaults to 1.
  minMax?: number;
  targetTicks?: number;
};

// Build a zero-baselined bar scale. `max` is a nice number at or above the largest value
// and the reference value; every non-null fraction lands in [0, 1]. All-null / all-zero
// input still returns a valid scale (fractions 0 or null) so the view renders an honest
// flat/empty chart rather than dividing by zero.
export function computeBarScale(
  values: readonly (number | null)[],
  options: BarScaleOptions = {},
): BarScale {
  const { referenceValue, minMax = 1, targetTicks = 4 } = options;
  const present = values.filter((v): v is number => v !== null);
  const dataMax = present.length > 0 ? Math.max(...present) : 0;
  const rawMax = Math.max(dataMax, referenceValue ?? 0, minMax);

  // Snap the top up to a nice multiple of a nice step, so ticks are round numbers.
  const step = niceStep(rawMax, targetTicks);
  const max = roundTo(Math.ceil(rawMax / step) * step, 6);
  const safeMax = max > 0 ? max : 1;

  return {
    baseline: 0,
    fractions: values.map((v) =>
      v === null ? null : clampFraction(v / safeMax),
    ),
    max: safeMax,
    referenceFraction:
      referenceValue === undefined
        ? null
        : clampFraction(referenceValue / safeMax),
    ticks: ticksBetween(0, safeMax, step),
  };
}

// ---------------------------------------------------------------------------
// Point scale (measurement trend — honest non-zero baseline)
// ---------------------------------------------------------------------------

export type PointScale = {
  // The bottom of the axis. Zero only when `zeroBaseline` was requested; otherwise a
  // nice number strictly below the lowest reading. ALWAYS returned so the view can label
  // it — a non-zero baseline is never silent.
  baseline: number;
  // The top of the axis, a nice number at or above the highest reading.
  top: number;
  // Whether the baseline is zero, so the view knows to flag a non-zero (magnified) axis.
  baselineIsZero: boolean;
  ticks: number[];
  // One fraction (0..1) per input value, in input order, where 0 is the baseline and 1
  // the top. No value ever maps outside [0, 1] because baseline ≤ min and top ≥ max.
  fractions: number[];
};

export type PointScaleOptions = {
  // Force a zero baseline (for a point series where zero is meaningful). Off by default:
  // body measurements use a magnified, clearly-labelled baseline.
  zeroBaseline?: boolean;
  // The minimum padding below the lowest and above the highest reading, in the value's
  // own units (e.g. kg), so points never sit exactly on the axis edges.
  minPadding?: number;
  // The half-height of the band drawn around a single reading (or a flat series), in the
  // value's units, so one point is centred rather than pinned to an edge.
  flatBand?: number;
  targetTicks?: number;
};

// Build a point (scatter/line) scale for a measurement trend. With no values it returns
// an empty scale (the tile shows the insufficient-data state). With one value — or a
// dead-flat series — it centres the reading in a symmetric band so a single weigh-in
// never masquerades as a trend.
export function computePointScale(
  values: readonly number[],
  options: PointScaleOptions = {},
): PointScale {
  const {
    zeroBaseline = false,
    minPadding = 0.5,
    flatBand = 1,
    targetTicks = 4,
  } = options;

  if (values.length === 0) {
    return {
      baseline: 0,
      baselineIsZero: true,
      fractions: [],
      ticks: [0],
      top: 0,
    };
  }

  const min = Math.min(...values);
  const max = Math.max(...values);

  let rawBaseline: number;
  let rawTop: number;
  if (max - min < 1e-9) {
    // A single reading, or several identical ones: a symmetric band around the value so
    // it sits in the middle, not on an edge (which would imply a rise or fall).
    rawBaseline = zeroBaseline ? 0 : min - flatBand;
    rawTop = max + flatBand;
  } else {
    const range = max - min;
    const padding = Math.max(range * 0.15, minPadding);
    rawBaseline = zeroBaseline ? 0 : min - padding;
    rawTop = max + padding;
  }

  const span = rawTop - rawBaseline || 1;
  const step = niceStep(span, targetTicks);
  const baseline = zeroBaseline
    ? 0
    : roundTo(Math.floor(rawBaseline / step) * step, 6);
  const top = roundTo(Math.ceil(rawTop / step) * step, 6);
  const safeSpan = top - baseline || 1;

  return {
    baseline,
    baselineIsZero: baseline === 0,
    fractions: values.map((v) => clampFraction((v - baseline) / safeSpan)),
    ticks: ticksBetween(baseline, top, step),
    top,
  };
}

// The fraction of the axis a single reference value sits at, in the same [0,1] frame as
// a point scale's fractions (0 = baseline, 1 = top). For drawing a trend-level marker
// (the smoothed weight) over the raw scatter. Clamped so an out-of-range level is drawn
// at an edge rather than off-plot.
export function pointFraction(scale: PointScale, value: number): number {
  const span = scale.top - scale.baseline || 1;
  return clampFraction((value - scale.baseline) / span);
}

function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) {
    return 0;
  }
  return Math.min(1, Math.max(0, fraction));
}
