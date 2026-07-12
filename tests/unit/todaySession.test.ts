import { describe, expect, it } from '@jest/globals';

import { currentWeekRange } from '@/domain/training/planSchedule';
import {
  computeWeeklyAdherence,
  deriveGreeting,
  deriveTodaySessionState,
  type TodaySession,
  toIsoDate,
} from '@/domain/training/todaySession';

const session = (overrides: Partial<TodaySession> = {}): TodaySession => ({
  id: 's-1',
  scheduledDate: '2026-07-13',
  sessionType: 'strength',
  status: 'planned',
  templateName: 'Strength A',
  ...overrides,
});

describe('toIsoDate', () => {
  it('formats a date as YYYY-MM-DD with zero padding', () => {
    // Local components; construct with explicit local fields.
    expect(toIsoDate(new Date(2026, 0, 5, 9, 30))).toBe('2026-01-05');
    expect(toIsoDate(new Date(2026, 11, 25, 23, 0))).toBe('2026-12-25');
  });
});

describe('deriveGreeting', () => {
  it('greets by part of the day in British English', () => {
    expect(deriveGreeting(6)).toBe('Good morning');
    expect(deriveGreeting(11)).toBe('Good morning');
    expect(deriveGreeting(12)).toBe('Good afternoon');
    expect(deriveGreeting(17)).toBe('Good afternoon');
    expect(deriveGreeting(18)).toBe('Good evening');
    expect(deriveGreeting(23)).toBe('Good evening');
  });
});

describe('deriveTodaySessionState', () => {
  it('reports none when nothing is scheduled', () => {
    expect(deriveTodaySessionState(null, null)).toEqual({ kind: 'none' });
  });

  it('reports a rest day for a rest session', () => {
    const rest = session({ sessionType: 'rest', templateName: null });
    expect(deriveTodaySessionState(rest, null)).toEqual({
      kind: 'rest',
      session: rest,
    });
  });

  it('reports completed when a matching log is completed', () => {
    const state = deriveTodaySessionState(session(), { status: 'completed' });
    expect(state.kind).toBe('completed');
  });

  it('reports completed when the session itself is marked completed', () => {
    const state = deriveTodaySessionState(
      session({ status: 'completed' }),
      null,
    );
    expect(state.kind).toBe('completed');
  });

  it('reports an active session ready to start when there is no log', () => {
    expect(deriveTodaySessionState(session(), null)).toEqual({
      inProgress: false,
      kind: 'active',
      session: session(),
    });
  });

  it('reports an active session in progress when a log is in progress', () => {
    const state = deriveTodaySessionState(session(), { status: 'in_progress' });
    expect(state).toEqual({
      inProgress: true,
      kind: 'active',
      session: session(),
    });
  });

  it('treats a completed rest day as completed, not rest', () => {
    const rest = session({ sessionType: 'rest', templateName: null });
    expect(deriveTodaySessionState(rest, { status: 'completed' }).kind).toBe(
      'completed',
    );
  });
});

describe('computeWeeklyAdherence', () => {
  const week = [
    { id: 'mon', sessionType: 'strength' },
    { id: 'tue', sessionType: 'cardio' },
    { id: 'wed', sessionType: 'achilles' },
    { id: 'thu', sessionType: 'strength' },
    { id: 'sun', sessionType: 'rest' },
  ];

  it('excludes rest days from the planned count', () => {
    const result = computeWeeklyAdherence(week, []);
    expect(result.planned).toBe(4);
    expect(result.completed).toBe(0);
    expect(result.percent).toBe(0);
  });

  it('counts completed training sessions with a matching completed log', () => {
    const result = computeWeeklyAdherence(week, [
      { scheduledSessionId: 'mon', status: 'completed' },
      { scheduledSessionId: 'tue', status: 'in_progress' },
      { scheduledSessionId: 'thu', status: 'completed' },
    ]);
    expect(result.completed).toBe(2);
    expect(result.planned).toBe(4);
    expect(result.percent).toBe(50);
  });

  it('returns a null percent when the week has no training sessions', () => {
    const result = computeWeeklyAdherence(
      [{ id: 'sun', sessionType: 'rest' }],
      [],
    );
    expect(result).toEqual({ completed: 0, percent: null, planned: 0 });
  });

  it('ignores logs for sessions outside the week', () => {
    const result = computeWeeklyAdherence(week, [
      { scheduledSessionId: 'other', status: 'completed' },
      { scheduledSessionId: null, status: 'completed' },
    ]);
    expect(result.completed).toBe(0);
  });
});

describe('currentWeekRange', () => {
  it('returns Monday to Sunday for a mid-week date', () => {
    // 2026-07-15 is a Wednesday.
    expect(currentWeekRange('2026-07-15')).toEqual({
      end: '2026-07-19',
      start: '2026-07-13',
    });
  });

  it('keeps a Monday as the start of its own week', () => {
    expect(currentWeekRange('2026-07-13')).toEqual({
      end: '2026-07-19',
      start: '2026-07-13',
    });
  });

  it('places a Sunday at the end of its week', () => {
    expect(currentWeekRange('2026-07-19')).toEqual({
      end: '2026-07-19',
      start: '2026-07-13',
    });
  });

  it('rejects an invalid date', () => {
    expect(() => currentWeekRange('not-a-date')).toThrow();
  });
});
