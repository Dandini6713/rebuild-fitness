import { describe, expect, it } from '@jest/globals';

import {
  buildCueEvents,
  buildTimeline,
  type CardioClock,
  COUNTDOWN_MIN_SECONDS,
  cuesBetween,
  deriveCardioProgress,
  effectiveElapsedSeconds,
  HALFWAY_MIN_SECONDS,
  type IntervalStep,
  isPaused,
  pauseClock,
  resumeClock,
  startClock,
} from '@/domain/training/cardioIntervalPlayer';

// A faithful reconstruction of one seeded stage's steps (docs/06 §6.3): warm-up,
// then (run, walk) repeated, then cool-down. Mirrors seed_cardio_stages so the
// timeline tests assert the exact shapes the database seeds.
function stageSteps(
  runSec: number,
  walkSec: number,
  repeats: number,
  warmup = 300,
  cooldown = 300,
): IntervalStep[] {
  const steps: IntervalStep[] = [];
  let order = 1;
  steps.push({
    activityType: 'warmup',
    cueText: 'Warm up',
    durationSeconds: warmup,
    order: order++,
  });
  for (let i = 0; i < repeats; i += 1) {
    steps.push({
      activityType: 'run',
      cueText: 'Run',
      durationSeconds: runSec,
      order: order++,
    });
    if (walkSec > 0) {
      steps.push({
        activityType: 'walk',
        cueText: 'Walk',
        durationSeconds: walkSec,
        order: order++,
      });
    }
  }
  steps.push({
    activityType: 'cooldown',
    cueText: 'Cool down',
    durationSeconds: cooldown,
    order: order++,
  });
  return steps;
}

// The nine stages exactly as the seed writes them, so a single source proves the
// step counts and total durations for the whole programme.
const STAGES: { stage: number; run: number; walk: number; repeats: number }[] =
  [
    { repeats: 8, run: 60, stage: 1, walk: 120 },
    { repeats: 8, run: 90, stage: 2, walk: 120 },
    { repeats: 7, run: 120, stage: 3, walk: 120 },
    { repeats: 6, run: 180, stage: 4, walk: 120 },
    { repeats: 4, run: 300, stage: 5, walk: 120 },
    { repeats: 3, run: 480, stage: 6, walk: 120 },
    { repeats: 2, run: 720, stage: 7, walk: 120 },
    { repeats: 1, run: 1200, stage: 8, walk: 0 },
    { repeats: 1, run: 1500, stage: 9, walk: 0 },
  ];

describe('buildTimeline', () => {
  it('places segments contiguously with absolute start/end seconds', () => {
    const timeline = buildTimeline([
      { activityType: 'warmup', cueText: null, durationSeconds: 300, order: 1 },
      { activityType: 'run', cueText: null, durationSeconds: 60, order: 2 },
      { activityType: 'walk', cueText: null, durationSeconds: 120, order: 3 },
    ]);
    expect(timeline.totalSeconds).toBe(480);
    expect(
      timeline.segments.map((s) => [s.startSeconds, s.endSeconds]),
    ).toEqual([
      [0, 300],
      [300, 360],
      [360, 480],
    ]);
    expect(timeline.segments.map((s) => s.index)).toEqual([0, 1, 2]);
  });

  it('sorts by order and drops non-positive durations', () => {
    const timeline = buildTimeline([
      { activityType: 'walk', cueText: null, durationSeconds: 120, order: 3 },
      { activityType: 'warmup', cueText: null, durationSeconds: 0, order: 1 },
      { activityType: 'run', cueText: null, durationSeconds: 60, order: 2 },
    ]);
    expect(timeline.segments.map((s) => s.step.activityType)).toEqual([
      'run',
      'walk',
    ]);
    expect(timeline.totalSeconds).toBe(180);
  });

  it('is empty for no steps', () => {
    const timeline = buildTimeline([]);
    expect(timeline.segments).toHaveLength(0);
    expect(timeline.totalSeconds).toBe(0);
  });

  it.each(STAGES)(
    'stage $stage has the documented step count and total duration',
    ({ run, walk, repeats }) => {
      const timeline = buildTimeline(stageSteps(run, walk, repeats));
      const walkSteps = walk > 0 ? repeats : 0;
      // warm-up + runs + walks + cool-down.
      expect(timeline.segments).toHaveLength(1 + repeats + walkSteps + 1);
      expect(timeline.totalSeconds).toBe(300 + repeats * (run + walk) + 300);
    },
  );

  it('stage 1 has exactly eight 60s runs and eight 120s walks', () => {
    const timeline = buildTimeline(stageSteps(60, 120, 8));
    const runs = timeline.segments.filter((s) => s.step.activityType === 'run');
    const walks = timeline.segments.filter(
      (s) => s.step.activityType === 'walk',
    );
    expect(runs).toHaveLength(8);
    expect(walks).toHaveLength(8);
    expect(runs.every((s) => s.step.durationSeconds === 60)).toBe(true);
    expect(walks.every((s) => s.step.durationSeconds === 120)).toBe(true);
  });

  it('continuous stages 8 and 9 have a single run segment and no walks', () => {
    const eight = buildTimeline(stageSteps(1200, 0, 1));
    const nine = buildTimeline(stageSteps(1500, 0, 1));
    expect(
      eight.segments.filter((s) => s.step.activityType === 'run'),
    ).toHaveLength(1);
    expect(
      eight.segments.filter((s) => s.step.activityType === 'walk'),
    ).toHaveLength(0);
    expect(
      nine.segments.filter((s) => s.step.activityType === 'run'),
    ).toHaveLength(1);
    expect(eight.totalSeconds).toBe(300 + 1200 + 300);
    expect(nine.totalSeconds).toBe(300 + 1500 + 300);
  });
});

describe('deriveCardioProgress', () => {
  const timeline = buildTimeline([
    { activityType: 'warmup', cueText: 'w', durationSeconds: 300, order: 1 },
    { activityType: 'run', cueText: 'r', durationSeconds: 60, order: 2 },
    { activityType: 'walk', cueText: 'k', durationSeconds: 120, order: 3 },
  ]);

  it('reports the first segment at t=0', () => {
    const p = deriveCardioProgress(timeline, 0);
    expect(p.current?.index).toBe(0);
    expect(p.segmentElapsedSeconds).toBe(0);
    expect(p.segmentRemainingSeconds).toBe(300);
    expect(p.totalRemainingSeconds).toBe(480);
    expect(p.next?.index).toBe(1);
    expect(p.isComplete).toBe(false);
  });

  it('mid-segment reports elapsed and remaining within the segment', () => {
    const p = deriveCardioProgress(timeline, 120);
    expect(p.current?.index).toBe(0);
    expect(p.segmentElapsedSeconds).toBe(120);
    expect(p.segmentRemainingSeconds).toBe(180);
    expect(p.totalElapsedSeconds).toBe(120);
  });

  it('a boundary belongs to the starting segment (endSeconds is exclusive)', () => {
    const p = deriveCardioProgress(timeline, 300);
    expect(p.current?.index).toBe(1);
    expect(p.current?.step.activityType).toBe('run');
    expect(p.segmentElapsedSeconds).toBe(0);
    expect(p.segmentRemainingSeconds).toBe(60);
    expect(p.completedSegments).toBe(1);
  });

  it('the last segment has no next', () => {
    const p = deriveCardioProgress(timeline, 400);
    expect(p.current?.index).toBe(2);
    expect(p.next).toBeNull();
  });

  it('is complete exactly at the total duration', () => {
    const p = deriveCardioProgress(timeline, 480);
    expect(p.isComplete).toBe(true);
    expect(p.current).toBeNull();
    expect(p.completedSegments).toBe(3);
    expect(p.totalElapsedSeconds).toBe(480);
    expect(p.totalRemainingSeconds).toBe(0);
  });

  it('clamps an over-long or negative elapsed', () => {
    expect(deriveCardioProgress(timeline, 100000).isComplete).toBe(true);
    const neg = deriveCardioProgress(timeline, -50);
    expect(neg.current?.index).toBe(0);
    expect(neg.totalElapsedSeconds).toBe(0);
  });
});

describe('buildCueEvents', () => {
  // A single 300s warm-up then a single 60s run: enough to see every cue kind.
  const timeline = buildTimeline([
    { activityType: 'warmup', cueText: 'w', durationSeconds: 300, order: 1 },
    { activityType: 'run', cueText: 'r', durationSeconds: 60, order: 2 },
  ]);
  const events = buildCueEvents(timeline);

  it('opens with a segment-start at t=0', () => {
    expect(events[0]).toMatchObject({
      atSeconds: 0,
      kind: 'segment-start',
      segmentIndex: 0,
    });
  });

  it('emits a halfway cue for a long segment', () => {
    const halfway = events.filter((e) => e.kind === 'halfway');
    expect(halfway.map((e) => e.atSeconds)).toEqual([150, 330]);
  });

  it('emits a 3-2-1 countdown at the end of each segment', () => {
    const warmupCountdown = events.filter(
      (e) => e.kind === 'countdown' && e.segmentIndex === 0,
    );
    expect(warmupCountdown.map((e) => [e.atSeconds, e.count])).toEqual([
      [297, 3],
      [298, 2],
      [299, 1],
    ]);
  });

  it('orders a boundary as segment-end then the next segment-start', () => {
    const atBoundary = events.filter((e) => e.atSeconds === 300);
    expect(atBoundary.map((e) => e.kind)).toEqual([
      'segment-end',
      'segment-start',
    ]);
  });

  it('ends with a single session-complete at the total duration', () => {
    const complete = events.filter((e) => e.kind === 'session-complete');
    expect(complete).toHaveLength(1);
    expect(complete[0]?.atSeconds).toBe(360);
  });

  it('carries the activity type on a segment-start so the adapter can differ run from walk', () => {
    const runStart = events.find(
      (e) => e.kind === 'segment-start' && e.segmentIndex === 1,
    );
    expect(runStart?.activityType).toBe('run');
  });

  it('omits the halfway cue for a segment shorter than the threshold', () => {
    const short = buildCueEvents(
      buildTimeline([
        {
          activityType: 'run',
          cueText: 'r',
          durationSeconds: HALFWAY_MIN_SECONDS - 1,
          order: 1,
        },
      ]),
    );
    expect(short.some((e) => e.kind === 'halfway')).toBe(false);
  });

  it('omits the countdown for a segment shorter than the threshold', () => {
    const short = buildCueEvents(
      buildTimeline([
        {
          activityType: 'run',
          cueText: 'r',
          durationSeconds: COUNTDOWN_MIN_SECONDS - 1,
          order: 1,
        },
      ]),
    );
    expect(short.some((e) => e.kind === 'countdown')).toBe(false);
  });

  it('is sorted by time', () => {
    const times = events.map((e) => e.atSeconds);
    expect(times).toEqual([...times].sort((a, b) => a - b));
  });
});

describe('cuesBetween', () => {
  const events = buildCueEvents(
    buildTimeline([
      { activityType: 'warmup', cueText: 'w', durationSeconds: 300, order: 1 },
      { activityType: 'run', cueText: 'r', durationSeconds: 60, order: 2 },
    ]),
  );

  it('includes t=0 when seeded from -1 (fires the opening cue once)', () => {
    const due = cuesBetween(events, -1, 0);
    expect(due).toHaveLength(1);
    expect(due[0]?.kind).toBe('segment-start');
  });

  it('is half-open: excludes the from bound, includes the to bound', () => {
    // The warm-up's first countdown is at 297.
    expect(cuesBetween(events, 297, 297)).toHaveLength(0);
    expect(cuesBetween(events, 296, 297).map((e) => e.count)).toEqual([3]);
  });

  it('returns nothing when the window has not advanced', () => {
    expect(cuesBetween(events, 100, 100)).toHaveLength(0);
    expect(cuesBetween(events, 100, 90)).toHaveLength(0);
  });

  it('fires every cue exactly once across a full tick-by-tick sweep', () => {
    const total = 360;
    const seen: number = events.length;
    let count = 0;
    let last = -1;
    for (let t = 0; t <= total; t += 1) {
      count += cuesBetween(events, last, t).length;
      last = t;
    }
    expect(count).toBe(seen);
  });

  it('catches multiple cues in a single larger step (a laggy tick)', () => {
    // Jumping the whole warm-up in one tick still yields all its cues once.
    const due = cuesBetween(events, -1, 300);
    const kinds = due.map((e) => e.kind);
    expect(kinds).toContain('segment-start');
    expect(kinds).toContain('halfway');
    expect(kinds).toContain('segment-end');
    expect(kinds.filter((k) => k === 'countdown')).toHaveLength(3);
  });
});

describe('pause / resume clock arithmetic', () => {
  it('a fresh clock is not paused and elapses in real time', () => {
    const clock = startClock(1_000_000);
    expect(isPaused(clock)).toBe(false);
    expect(effectiveElapsedSeconds(clock, 1_000_000)).toBe(0);
    expect(effectiveElapsedSeconds(clock, 1_010_000)).toBe(10);
  });

  it('while paused, elapsed stops advancing', () => {
    const clock = pauseClock(startClock(1_000_000), 1_005_000);
    // 5s elapsed at the moment of pause; time keeps passing but elapsed is frozen.
    expect(effectiveElapsedSeconds(clock, 1_005_000)).toBe(5);
    expect(effectiveElapsedSeconds(clock, 1_020_000)).toBe(5);
  });

  it('after resume, elapsed continues from where it paused (paused time excluded)', () => {
    let clock = startClock(1_000_000);
    clock = pauseClock(clock, 1_005_000); // paused at 5s
    clock = resumeClock(clock, 1_020_000); // 15s spent paused
    expect(isPaused(clock)).toBe(false);
    // At 1_025_000: real 25s minus 15s paused = 10s effective.
    expect(effectiveElapsedSeconds(clock, 1_025_000)).toBe(10);
  });

  it('accumulates multiple pauses', () => {
    let clock = startClock(0);
    clock = pauseClock(clock, 10_000); // 10s in
    clock = resumeClock(clock, 30_000); // paused 20s
    clock = pauseClock(clock, 40_000); // another 10s of running -> 20s effective
    clock = resumeClock(clock, 100_000); // paused 60s
    // total paused = 80s; at 130_000 real=130s, effective = 130 - 80 = 50s.
    expect(effectiveElapsedSeconds(clock, 130_000)).toBe(50);
  });

  it('pausing an already-paused clock keeps the original pause instant', () => {
    const first = pauseClock(startClock(0), 5_000);
    const again = pauseClock(first, 9_000);
    expect(again).toBe(first);
    expect(effectiveElapsedSeconds(again, 20_000)).toBe(5);
  });

  it('resuming a running clock is a no-op', () => {
    const clock = startClock(0);
    expect(resumeClock(clock, 10_000)).toBe(clock);
  });

  it('never reports negative elapsed', () => {
    const clock: CardioClock = {
      pausedAccumMs: 0,
      pausedAtMs: null,
      startedAtMs: 5_000,
    };
    expect(effectiveElapsedSeconds(clock, 0)).toBe(0);
  });
});
