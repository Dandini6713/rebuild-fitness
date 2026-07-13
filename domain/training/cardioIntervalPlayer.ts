// Pure interval scheduler for the cardio session player (S-014, docs/06 §6.3). It
// is the cardio counterpart to workoutPlayer.ts / workoutTimer.ts: no React, no
// I/O, no audio, no haptics, and no reliance on the ambient clock — the caller
// passes `nowMs`. Given the ordered interval steps and the elapsed time it computes
// the current segment, the time left in it, the next transition, and the typed CUE
// EVENTS (segment-start, halfway, the final 3-2-1 countdown, segment-end and
// session-complete) with their exact timings. A thin device adapter turns those
// events into audio/haptic effects; nothing device-shaped lives here, so this can
// be tested exhaustively.
//
// THE KEY SPLIT (see the roadmap brief): the cue DECISION is here and fully tested;
// the cue EFFECT is the adapter's job. A failing test here means the timer logic is
// wrong; a failing cue in the field means the adapter did not fire — never the two
// confused.
//
// Nothing here diagnoses or assesses anything (docs/07). An interval timer is a
// convenience for pacing a walk or run-walk, never a safety gate.

// One step of a cardio template, resolved from cardio_interval_steps. `cueText` is
// the short British-English instruction shown/announced for the segment.
export type IntervalStep = {
  order: number;
  activityType: string;
  durationSeconds: number;
  cueText: string | null;
};

// A step placed on the session timeline: the absolute second it starts and ends,
// measured from session start (a not-paused clock). `endSeconds` is exclusive — it
// is where the next segment begins — and for the final step it equals the session's
// total duration.
export type TimelineSegment = {
  index: number;
  step: IntervalStep;
  startSeconds: number;
  endSeconds: number;
};

export type IntervalTimeline = {
  segments: TimelineSegment[];
  totalSeconds: number;
};

// The resolved live state, derived from the timeline and the elapsed seconds. When
// the session is finished (`isComplete`), `current` is null and `completedSegments`
// equals the segment count.
export type CardioProgress = {
  current: TimelineSegment | null;
  next: TimelineSegment | null;
  // Whole seconds elapsed within the current segment, and left in it.
  segmentElapsedSeconds: number;
  segmentRemainingSeconds: number;
  // Whole seconds elapsed in the whole session (capped at the total) and left.
  totalElapsedSeconds: number;
  totalRemainingSeconds: number;
  completedSegments: number;
  segmentCount: number;
  isComplete: boolean;
};

export type CueKind =
  | 'segment-start'
  | 'halfway'
  | 'countdown'
  | 'segment-end'
  | 'session-complete';

// A single cue on the timeline. `atSeconds` is when it fires (from session start).
// `count` is the spoken number for a countdown cue (3, 2 or 1). `activityType` is
// carried so the adapter can pick a distinct effect for a run start versus a walk
// start without re-deriving the segment.
export type CueEvent = {
  atSeconds: number;
  kind: CueKind;
  segmentIndex: number;
  activityType: string | null;
  count?: number;
};

// The clock behind the elapsed time. It survives a background/lock and a resume:
// `startedAtMs` is when the session began, `pausedAccumMs` is the total time
// already spent paused, and `pausedAtMs` is set while currently paused. Effective
// elapsed excludes all paused time, so the interval timeline never advances while
// the user has the session paused.
export type CardioClock = {
  startedAtMs: number;
  pausedAccumMs: number;
  pausedAtMs: number | null;
};

// Only segments at least this long get a halfway cue. Short warm-down/transition
// steps do not, so the halfway cue never becomes noise. Expressed once here.
export const HALFWAY_MIN_SECONDS = 60;

// The countdown fires on the final three seconds of a segment (…3, 2, 1), but only
// when the segment is long enough to have three distinct pre-end seconds.
export const COUNTDOWN_MIN_SECONDS = 4;

// Order cues that share an instant deterministically: a finishing segment's tail
// (countdown, then its end) comes before the next segment's start; the whole
// session's completion sits between a final segment-end and any (non-existent)
// following start.
const KIND_ORDER: Record<CueKind, number> = {
  countdown: 0,
  'segment-end': 1,
  'session-complete': 2,
  'segment-start': 3,
  halfway: 4,
};

// Place the ordered steps on an absolute-seconds timeline. Steps are sorted by
// `order` first so a caller need not pre-sort. Zero/negative durations are dropped
// (a step must occupy time to be a segment); the DB forbids them, but the pure
// function stays honest if handed bad data.
export function buildTimeline(
  steps: readonly IntervalStep[],
): IntervalTimeline {
  const ordered = [...steps]
    .filter((step) => step.durationSeconds > 0)
    .sort((a, b) => a.order - b.order);
  const segments: TimelineSegment[] = [];
  let cursor = 0;
  ordered.forEach((step, index) => {
    const startSeconds = cursor;
    const endSeconds = cursor + step.durationSeconds;
    segments.push({ endSeconds, index, startSeconds, step });
    cursor = endSeconds;
  });
  return { segments, totalSeconds: cursor };
}

// Which segment contains `elapsedSeconds`. A boundary belongs to the segment that
// is *starting*: at t = endSeconds of segment i (= startSeconds of segment i+1) the
// current segment is i+1. Past the end, returns null.
function segmentAt(
  timeline: IntervalTimeline,
  elapsedSeconds: number,
): TimelineSegment | null {
  if (elapsedSeconds >= timeline.totalSeconds) {
    return null;
  }
  for (const segment of timeline.segments) {
    if (
      elapsedSeconds >= segment.startSeconds &&
      elapsedSeconds < segment.endSeconds
    ) {
      return segment;
    }
  }
  // Before the first segment (negative elapsed, clamped below in practice): treat
  // as the first segment so the session opens on step one.
  return timeline.segments[0] ?? null;
}

// Derive the live progress from the timeline and the elapsed seconds. Elapsed is
// clamped to [0, total] so a clock nudged slightly out of range never yields a
// negative or over-long read.
export function deriveCardioProgress(
  timeline: IntervalTimeline,
  elapsedSeconds: number,
): CardioProgress {
  const total = timeline.totalSeconds;
  const clamped = Math.max(0, Math.min(elapsedSeconds, total));
  const segmentCount = timeline.segments.length;
  const isComplete = segmentCount > 0 && clamped >= total;

  if (isComplete) {
    return {
      completedSegments: segmentCount,
      current: null,
      isComplete: true,
      next: null,
      segmentCount,
      segmentElapsedSeconds: 0,
      segmentRemainingSeconds: 0,
      totalElapsedSeconds: total,
      totalRemainingSeconds: 0,
    };
  }

  const current = segmentAt(timeline, clamped);
  const next =
    current && current.index + 1 < segmentCount
      ? (timeline.segments[current.index + 1] ?? null)
      : null;
  const segmentElapsed = current
    ? Math.max(0, Math.floor(clamped - current.startSeconds))
    : 0;
  const segmentRemaining = current
    ? Math.max(0, Math.ceil(current.endSeconds - clamped))
    : 0;

  return {
    completedSegments: current ? current.index : 0,
    current,
    isComplete: false,
    next,
    segmentCount,
    segmentElapsedSeconds: segmentElapsed,
    segmentRemainingSeconds: segmentRemaining,
    totalElapsedSeconds: Math.floor(clamped),
    totalRemainingSeconds: Math.max(0, Math.ceil(total - clamped)),
  };
}

// The full, ordered list of cue events for a timeline. Each segment contributes a
// segment-start (at its start), a halfway (mid-point, if long enough), a 3-2-1
// countdown (its final three seconds, if long enough) and a segment-end (at its
// end). One session-complete sits at the total duration. Events are sorted by time,
// then by KIND_ORDER so simultaneous cues have a stable, meaningful order.
export function buildCueEvents(timeline: IntervalTimeline): CueEvent[] {
  const events: CueEvent[] = [];
  for (const segment of timeline.segments) {
    const { activityType } = segment.step;
    const duration = segment.step.durationSeconds;

    events.push({
      activityType,
      atSeconds: segment.startSeconds,
      kind: 'segment-start',
      segmentIndex: segment.index,
    });

    if (duration >= HALFWAY_MIN_SECONDS) {
      events.push({
        activityType,
        atSeconds: segment.startSeconds + Math.floor(duration / 2),
        kind: 'halfway',
        segmentIndex: segment.index,
      });
    }

    if (duration >= COUNTDOWN_MIN_SECONDS) {
      for (const count of [3, 2, 1]) {
        events.push({
          activityType,
          atSeconds: segment.endSeconds - count,
          count,
          kind: 'countdown',
          segmentIndex: segment.index,
        });
      }
    }

    events.push({
      activityType,
      atSeconds: segment.endSeconds,
      kind: 'segment-end',
      segmentIndex: segment.index,
    });
  }

  if (timeline.segments.length > 0) {
    events.push({
      activityType: null,
      atSeconds: timeline.totalSeconds,
      kind: 'session-complete',
      segmentIndex: timeline.segments.length - 1,
    });
  }

  return events.sort(
    (a, b) =>
      a.atSeconds - b.atSeconds || KIND_ORDER[a.kind] - KIND_ORDER[b.kind],
  );
}

// The cues that fall in the half-open interval (fromExclusive, toInclusive]. The
// player calls this each tick with (previousElapsed, currentElapsed] so every cue
// fires exactly once as its instant passes. Seed the first tick with
// fromExclusive = -1 so a cue at t = 0 (the opening segment-start) is included.
export function cuesBetween(
  events: readonly CueEvent[],
  fromExclusive: number,
  toInclusive: number,
): CueEvent[] {
  if (toInclusive <= fromExclusive) {
    return [];
  }
  return events.filter(
    (event) =>
      event.atSeconds > fromExclusive && event.atSeconds <= toInclusive,
  );
}

// --- Pause / resume clock arithmetic -----------------------------------------
//
// Kept pure and here (elapsed drives the whole scheduler) so the pause maths is
// tested without a real clock, exactly as the roadmap brief asks.

// Effective whole seconds elapsed on a clock, excluding all paused time. Never
// negative. While paused, time does not accrue: the current pause's span (nowMs −
// pausedAtMs) is subtracted alongside the already-accumulated paused time.
export function effectiveElapsedSeconds(
  clock: CardioClock,
  nowMs: number,
): number {
  const activePauseMs =
    clock.pausedAtMs === null ? 0 : Math.max(0, nowMs - clock.pausedAtMs);
  const elapsedMs =
    nowMs - clock.startedAtMs - clock.pausedAccumMs - activePauseMs;
  return Math.max(0, Math.floor(elapsedMs / 1000));
}

// Whether the clock is currently paused.
export function isPaused(clock: CardioClock): boolean {
  return clock.pausedAtMs !== null;
}

// Begin a pause at `nowMs`. A no-op if already paused (the existing pause stands),
// so a double-pause never loses the original pause instant.
export function pauseClock(clock: CardioClock, nowMs: number): CardioClock {
  if (clock.pausedAtMs !== null) {
    return clock;
  }
  return { ...clock, pausedAtMs: nowMs };
}

// End a pause at `nowMs`, folding its span into the accumulated paused total. A
// no-op if not paused. After this the effective elapsed continues exactly where it
// left off when the pause began.
export function resumeClock(clock: CardioClock, nowMs: number): CardioClock {
  if (clock.pausedAtMs === null) {
    return clock;
  }
  const pausedForMs = Math.max(0, nowMs - clock.pausedAtMs);
  return {
    ...clock,
    pausedAccumMs: clock.pausedAccumMs + pausedForMs,
    pausedAtMs: null,
  };
}

// Start a fresh clock at `startedAtMs`, not paused.
export function startClock(startedAtMs: number): CardioClock {
  return { pausedAccumMs: 0, pausedAtMs: null, startedAtMs };
}
