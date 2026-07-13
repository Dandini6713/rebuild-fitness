import { describe, expect, it } from '@jest/globals';

import {
  computeNotificationSchedule,
  type NotificationPreferences,
  type PlannedSessionInput,
  type ScheduledNotification,
} from '@/domain/notifications/notificationSchedule';

// A fixed reference: Monday 13 July 2026, 09:00 LOCAL. Built with the local Date
// constructor so it aligns with the module's local-day interpretation regardless of the
// machine's zone (both `now` and the computed fire times use the same local zone).
const MONDAY_9AM = new Date(2026, 6, 13, 9, 0, 0, 0);

function prefs(
  overrides: Partial<NotificationPreferences> = {},
): NotificationPreferences {
  return {
    next_morning: false,
    readiness: false,
    sessions: false,
    waist: false,
    weekly_review: false,
    weigh_in: false,
    ...overrides,
  };
}

function session(
  overrides: Partial<PlannedSessionInput> = {},
): PlannedSessionInput {
  return {
    dateIso: '2026-07-14',
    id: 'sess-1',
    nextMorningExpected: false,
    sessionType: 'strength',
    status: 'planned',
    ...overrides,
  };
}

function typesOf(schedule: ScheduledNotification[]): string[] {
  return schedule.map((n) => n.type);
}

describe('computeNotificationSchedule — session reminders', () => {
  it('schedules a planned session on its local day at the morning time; skips rest and non-planned', () => {
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: true }),
      sessions: [
        session({ id: 'a', dateIso: '2026-07-14', sessionType: 'strength' }),
        session({ id: 'b', dateIso: '2026-07-15', sessionType: 'rest' }),
        session({ id: 'c', dateIso: '2026-07-16', status: 'skipped' }),
      ],
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0]?.type).toBe('sessions');
    expect(schedule[0]?.key).toBe('sessions:a');
    expect(schedule[0]?.fireAt).toEqual({
      day: 14,
      hour: 8,
      minute: 0,
      month: 7,
      year: 2026,
    });
  });

  it('does not schedule a session whose fire time is already in the past today', () => {
    // A session today (13 July) at 08:00 is before now (09:00), so it is not scheduled.
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: true }),
      sessions: [session({ id: 'today', dateIso: '2026-07-13' })],
    });
    expect(schedule).toHaveLength(0);
  });

  it('yields nothing for a disabled type', () => {
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ sessions: false }),
      sessions: [session()],
    });
    expect(schedule).toHaveLength(0);
  });
});

describe('computeNotificationSchedule — readiness (gated sessions only)', () => {
  it('schedules a pre-session check only for gated sessions, earlier than the session reminder', () => {
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ readiness: true }),
      sessions: [
        session({
          id: 'strength',
          sessionType: 'strength',
          dateIso: '2026-07-14',
        }),
        session({
          id: 'running',
          sessionType: 'running',
          dateIso: '2026-07-15',
        }),
        session({ id: 'cardio', sessionType: 'cardio', dateIso: '2026-07-16' }),
        session({ id: 'rest', sessionType: 'rest', dateIso: '2026-07-17' }),
      ],
    });

    // running + strength are gated; cardio + rest are not.
    expect(schedule.map((n) => n.key).sort()).toEqual([
      'readiness:running',
      'readiness:strength',
    ]);
    const strength = schedule.find((n) => n.key === 'readiness:strength');
    expect(strength?.fireAt).toEqual({
      day: 14,
      hour: 7,
      minute: 0,
      month: 7,
      year: 2026,
    });
  });
});

describe('computeNotificationSchedule — next-morning check', () => {
  it('schedules the morning after a flagged session; nothing for an unflagged one', () => {
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ next_morning: true }),
      sessions: [
        session({
          id: 'flagged',
          dateIso: '2026-07-14',
          nextMorningExpected: true,
        }),
        session({
          id: 'plain',
          dateIso: '2026-07-15',
          nextMorningExpected: false,
        }),
      ],
    });

    expect(schedule).toHaveLength(1);
    expect(schedule[0]?.type).toBe('next_morning');
    expect(schedule[0]?.key).toBe('next-morning:flagged');
    // The morning AFTER 14 July → 15 July at 08:00.
    expect(schedule[0]?.fireAt).toEqual({
      day: 15,
      hour: 8,
      minute: 0,
      month: 7,
      year: 2026,
    });
  });
});

describe('computeNotificationSchedule — weigh-in / waist cadence', () => {
  it('anchors the next weigh-in on the last weigh-in plus the weekly interval (local day)', () => {
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: '2026-07-10',
      now: MONDAY_9AM,
      preferences: prefs({ weigh_in: true }),
      sessions: [],
    });

    // 10 July + 7 = 17 July, then 24 July, both within the 14-day horizon.
    const days = schedule.map((n) => `${n.fireAt.month}-${n.fireAt.day}`);
    expect(days).toEqual(['7-17', '7-24']);
    expect(schedule[0]?.fireAt.hour).toBe(7);
    expect(schedule[0]?.fireAt.minute).toBe(30);
    expect(schedule.every((n) => n.type === 'weigh_in')).toBe(true);
  });

  it('with no history, anchors on today and steps past a fire time already gone', () => {
    // Today 07:30 is before now (09:00), so the first weigh-in is one interval later.
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ weigh_in: true }),
      sessions: [],
    });
    const days = schedule.map((n) => `${n.fireAt.month}-${n.fireAt.day}`);
    expect(days).toEqual(['7-20', '7-27']);
  });
});

describe('computeNotificationSchedule — weekly review', () => {
  it('schedules the weekly review on the next Sundays within the horizon', () => {
    const schedule = computeNotificationSchedule({
      lastWaistDayIso: null,
      lastWeighInDayIso: null,
      now: MONDAY_9AM,
      preferences: prefs({ weekly_review: true }),
      sessions: [],
    });
    // From Monday 13 July, the next Sundays are 19 and 26 July at 18:00.
    const days = schedule.map((n) => `${n.fireAt.month}-${n.fireAt.day}`);
    expect(days).toEqual(['7-19', '7-26']);
    expect(
      schedule.every((n) => n.fireAt.hour === 18 && n.type === 'weekly_review'),
    ).toBe(true);
  });
});

describe('computeNotificationSchedule — independence and key uniqueness', () => {
  it('each type contributes only when enabled; keys are unique across the full set', () => {
    const everything = computeNotificationSchedule({
      lastWaistDayIso: '2026-07-01',
      lastWeighInDayIso: '2026-07-10',
      now: MONDAY_9AM,
      preferences: prefs({
        next_morning: true,
        readiness: true,
        sessions: true,
        waist: true,
        weekly_review: true,
        weigh_in: true,
      }),
      sessions: [
        session({
          id: 'g',
          dateIso: '2026-07-14',
          sessionType: 'strength',
          nextMorningExpected: true,
        }),
      ],
    });

    // All six types appear.
    expect(new Set(typesOf(everything))).toEqual(
      new Set([
        'sessions',
        'readiness',
        'next_morning',
        'weigh_in',
        'waist',
        'weekly_review',
      ]),
    );
    // Unique keys → the adapter (which replaces the whole set) never double-delivers.
    const keys = everything.map((n) => n.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('computeNotificationSchedule — PRIVACY: no health detail in any copy', () => {
  it('never puts a value, classification, injury or calorie detail in any title or body', () => {
    const everything = computeNotificationSchedule({
      lastWaistDayIso: '2026-07-01',
      lastWeighInDayIso: '2026-07-10',
      now: MONDAY_9AM,
      preferences: prefs({
        next_morning: true,
        readiness: true,
        sessions: true,
        waist: true,
        weekly_review: true,
        weigh_in: true,
      }),
      sessions: [
        session({
          id: 'g',
          dateIso: '2026-07-14',
          sessionType: 'strength',
          nextMorningExpected: true,
        }),
        session({ id: 'r', dateIso: '2026-07-16', sessionType: 'running' }),
      ],
    });

    expect(everything.length).toBeGreaterThan(0);

    // A lock-screen observer must not learn a value, a readiness classification, an
    // Achilles/injury detail, a calorie/target number, or the demanding nature of a
    // session. Any digit or health token in copy is a bug (docs/07). The activity NAME
    // (weigh-in, waist, session, check-in) is allowed — it is the control, not a value.
    const forbidden = [
      /\d/, // no numbers of any kind
      /\bkg\b/i,
      /\bkcal\b/i,
      /calorie/i,
      /protein/i,
      /\bweight\b/i,
      /\bred\b/i,
      /\bamber\b/i,
      /\bgreen\b/i,
      /achilles/i,
      /tendon/i,
      /injur/i,
      /\bpain\b/i,
      /\bstrength\b/i,
      /\brunning\b/i,
    ];

    for (const notification of everything) {
      const text = `${notification.title} ${notification.body}`;
      for (const pattern of forbidden) {
        expect(text).not.toMatch(pattern);
      }
    }
  });
});
