import { describe, expect, it } from '@jest/globals';

import {
  describeDuration,
  elapsedSeconds,
  formatDuration,
  isRestFinished,
  restRemainingSeconds,
} from '@/domain/training/workoutTimer';

const START = '2026-07-12T10:00:00.000Z';
const startMs = Date.parse(START);

describe('elapsedSeconds', () => {
  it('counts whole seconds since the start', () => {
    expect(elapsedSeconds(START, startMs + 65_400)).toBe(65);
  });

  it('never goes negative for a start stamped in the future', () => {
    expect(elapsedSeconds(START, startMs - 5_000)).toBe(0);
  });

  it('reads an unparseable start as zero rather than NaN', () => {
    expect(elapsedSeconds('not-a-date', startMs)).toBe(0);
  });
});

describe('formatDuration', () => {
  it('uses M:SS under an hour', () => {
    expect(formatDuration(0)).toBe('0:00');
    expect(formatDuration(5)).toBe('0:05');
    expect(formatDuration(185)).toBe('3:05');
  });

  it('switches to H:MM:SS once an hour has passed', () => {
    expect(formatDuration(3_661)).toBe('1:01:01');
  });

  it('clamps a negative input to zero', () => {
    expect(formatDuration(-10)).toBe('0:00');
  });
});

describe('describeDuration', () => {
  it('spells out minutes and seconds for a screen reader', () => {
    expect(describeDuration(1)).toBe('1 second');
    expect(describeDuration(65)).toBe('1 minute, 5 seconds');
    expect(describeDuration(120)).toBe('2 minutes, 0 seconds');
  });
});

describe('rest timer', () => {
  it('rounds the remaining time up so the last second shows in full', () => {
    // 90s rest, 89.4s elapsed → 1s remaining, not 0.
    expect(restRemainingSeconds(startMs, 90, startMs + 89_400)).toBe(1);
  });

  it('clamps to zero once the rest has run out', () => {
    expect(restRemainingSeconds(startMs, 90, startMs + 95_000)).toBe(0);
  });

  it('reports finished only when nothing remains', () => {
    expect(isRestFinished(startMs, 90, startMs + 30_000)).toBe(false);
    expect(isRestFinished(startMs, 90, startMs + 90_000)).toBe(true);
  });
});
