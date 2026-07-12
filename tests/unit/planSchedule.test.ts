import { describe, expect, it } from '@jest/globals';

import {
  DEFAULT_WEEKLY_PATTERN,
  describeSessionType,
  formatPlanDate,
  PLAN_WEEK_COUNT,
  resolvePlanStartDate,
} from '@/domain/training/planSchedule';

describe('resolvePlanStartDate', () => {
  it('moves a mid-week confirmation to the following Monday', () => {
    // 2026-07-11 is a Saturday.
    expect(resolvePlanStartDate('2026-07-11T09:00:00.000Z')).toBe('2026-07-13');
  });

  it('keeps a Monday confirmation on the same day', () => {
    expect(resolvePlanStartDate('2026-07-13T12:00:00.000Z')).toBe('2026-07-13');
  });

  it('moves a Sunday confirmation to the next day', () => {
    expect(resolvePlanStartDate('2026-07-12T23:00:00.000Z')).toBe('2026-07-13');
  });

  it('resolves in UTC regardless of the local hour', () => {
    // Late UTC on Saturday is still Saturday; the start is the next Monday.
    expect(resolvePlanStartDate('2026-07-11T23:59:59.000Z')).toBe('2026-07-13');
  });

  it('rejects an invalid confirmation date', () => {
    expect(() => resolvePlanStartDate('not-a-date')).toThrow();
  });
});

describe('formatPlanDate', () => {
  it('formats a stored date in British English', () => {
    expect(formatPlanDate('2026-07-13')).toBe('Monday 13 July');
    expect(formatPlanDate('2026-08-03')).toBe('Monday 3 August');
  });

  it('returns the input unchanged when it is not a plain date', () => {
    expect(formatPlanDate('nonsense')).toBe('nonsense');
  });
});

describe('describeSessionType', () => {
  it('labels the known session types', () => {
    expect(describeSessionType('strength')).toBe('Strength');
    expect(describeSessionType('achilles')).toBe(
      'Achilles strength and mobility',
    );
    expect(describeSessionType('rest')).toBe('Rest day');
  });

  it('humanises an unknown session type instead of showing a slug', () => {
    expect(describeSessionType('run_walk')).toBe('run walk');
  });
});

describe('weekly pattern', () => {
  it('describes a full seven-day week over twelve weeks', () => {
    expect(DEFAULT_WEEKLY_PATTERN).toHaveLength(7);
    expect(PLAN_WEEK_COUNT).toBe(12);
    // Strength on Monday and Thursday, a single rest day.
    expect(DEFAULT_WEEKLY_PATTERN[0]).toBe('strength');
    expect(DEFAULT_WEEKLY_PATTERN[3]).toBe('strength');
    expect(DEFAULT_WEEKLY_PATTERN.filter((day) => day === 'rest')).toHaveLength(
      1,
    );
  });
});
