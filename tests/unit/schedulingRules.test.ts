import { describe, expect, it } from '@jest/globals';

import {
  classifySession,
  evaluateSchedulingChange,
  evaluateVolumeIncrease,
  isActiveStatus,
  type EvaluateOptions,
  type SchedulingChange,
  type SchedulingSession,
} from '@/domain/training/schedulingRules';

// A canonical Monday-start week mirroring the seeded plan:
// Mon strength, Tue cardio, Wed achilles, Thu strength, Fri/Sat cardio, Sun rest.
const WEEK_DATES = [
  '2026-08-03', // Mon
  '2026-08-04', // Tue
  '2026-08-05', // Wed
  '2026-08-06', // Thu
  '2026-08-07', // Fri
  '2026-08-08', // Sat
  '2026-08-09', // Sun
];

function session(
  overrides: Partial<SchedulingSession> & { id: string },
): SchedulingSession {
  return {
    scheduledDate: '2026-08-03',
    sessionType: 'cardio',
    status: 'planned',
    ...overrides,
  };
}

const baseWeek = (): SchedulingSession[] => [
  session({ id: 'mon', scheduledDate: '2026-08-03', sessionType: 'strength' }),
  session({ id: 'tue', scheduledDate: '2026-08-04', sessionType: 'cardio' }),
  session({ id: 'wed', scheduledDate: '2026-08-05', sessionType: 'achilles' }),
  session({ id: 'thu', scheduledDate: '2026-08-06', sessionType: 'strength' }),
  session({ id: 'fri', scheduledDate: '2026-08-07', sessionType: 'cardio' }),
  session({ id: 'sat', scheduledDate: '2026-08-08', sessionType: 'cardio' }),
  session({ id: 'sun', scheduledDate: '2026-08-09', sessionType: 'rest' }),
];

const options = (
  overrides: Partial<EvaluateOptions> = {},
): EvaluateOptions => ({
  isEarlyPhase: true,
  weekDates: WEEK_DATES,
  ...overrides,
});

function codes(
  change: SchedulingChange,
  sessions: SchedulingSession[],
  opts = options(),
) {
  const result = evaluateSchedulingChange(change, sessions, opts);
  return {
    hard: result.hard.map((c) => c.code),
    soft: result.soft.map((c) => c.code),
    result,
  };
}

describe('classifySession', () => {
  it('treats strength as a demanding lower-body session', () => {
    const c = classifySession({ sessionType: 'strength' });
    expect(c.isDemandingLowerBody).toBe(true);
    expect(c.isDemanding).toBe(true);
    expect(c.isRunning).toBe(false);
    expect(c.isRestOrRecovery).toBe(false);
  });

  it('treats running as demanding but not lower-body', () => {
    const c = classifySession({ sessionType: 'running' });
    expect(c.isRunning).toBe(true);
    expect(c.isDemanding).toBe(true);
    expect(c.isDemandingLowerBody).toBe(false);
  });

  it('does not treat walking cardio as running or demanding', () => {
    const c = classifySession({ sessionType: 'cardio' });
    expect(c.isRunning).toBe(false);
    expect(c.isDemanding).toBe(false);
  });

  it('treats rest and achilles as rest-or-recovery, never demanding', () => {
    expect(classifySession({ sessionType: 'rest' })).toMatchObject({
      isDemanding: false,
      isRestOrRecovery: true,
    });
    expect(classifySession({ sessionType: 'achilles' })).toMatchObject({
      isDemanding: false,
      isRestOrRecovery: true,
    });
  });

  it('classifies an unknown future type as neither demanding nor recovery', () => {
    const c = classifySession({ sessionType: 'mobility-flow' });
    expect(c).toEqual({
      isDemanding: false,
      isDemandingLowerBody: false,
      isRestOrRecovery: false,
      isRunning: false,
    });
  });
});

describe('isActiveStatus', () => {
  it('counts planned, in progress and completed as active', () => {
    expect(isActiveStatus('planned')).toBe(true);
    expect(isActiveStatus('in_progress')).toBe(true);
    expect(isActiveStatus('completed')).toBe(true);
  });

  it('counts skipped, cancelled and replaced as inactive', () => {
    expect(isActiveStatus('skipped')).toBe(false);
    expect(isActiveStatus('cancelled')).toBe(false);
    expect(isActiveStatus('replaced')).toBe(false);
  });
});

describe('hard rule — no two running sessions on consecutive days', () => {
  const runWeek = (): SchedulingSession[] => [
    session({
      id: 'mon-run',
      scheduledDate: '2026-08-03',
      sessionType: 'running',
    }),
    session({
      id: 'wed-run',
      scheduledDate: '2026-08-05',
      sessionType: 'running',
    }),
    session({ id: 'sun', scheduledDate: '2026-08-09', sessionType: 'rest' }),
  ];

  it('blocks a run moved to exactly one day after another run', () => {
    // Monday run + move Wednesday run to Tuesday => Mon/Tue consecutive.
    const { hard } = codes(
      { kind: 'move', sessionId: 'wed-run', toDate: '2026-08-04' },
      runWeek(),
    );
    expect(hard).toContain('running-consecutive-days');
  });

  it('allows runs exactly two days apart (boundary)', () => {
    // Move Wednesday run to Thursday: Mon and Thu are three apart; still fine.
    const { hard } = codes(
      { kind: 'move', sessionId: 'wed-run', toDate: '2026-08-06' },
      runWeek(),
    );
    expect(hard).not.toContain('running-consecutive-days');
  });

  it('does not treat walking cardio on consecutive days as a running clash', () => {
    // Base week has Fri/Sat cardio back to back — walking, not running.
    const { hard } = codes(
      { kind: 'move', sessionId: 'tue', toDate: '2026-08-04' },
      baseWeek(),
    );
    expect(hard).not.toContain('running-consecutive-days');
  });
});

describe('the seeded plan never flags itself as conflicted', () => {
  // The seed types nothing as 'running' (cardio is one bucket of walks, bikes and
  // run-walks), so the two run-based rules stay dormant against the default plan.
  // This guards against a regression where cardio is reclassified as a run, which
  // would wrongly flag the seeded Fri/Sat cardio pair as consecutive runs.
  it('produces no hard conflict when a session is left where it is', () => {
    // A no-op move evaluates all three hard rules against the untouched week.
    const { hard } = codes(
      { kind: 'move', sessionId: 'sat', toDate: '2026-08-08' },
      baseWeek(),
    );
    expect(hard).toEqual([]);
  });

  it('never reports the two run-based conflicts for the all-cardio week', () => {
    for (const id of ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']) {
      const { hard, soft } = codes({ kind: 'skip', sessionId: id }, baseWeek());
      expect(hard).not.toContain('running-consecutive-days');
      expect(soft).not.toContain('lower-body-before-run');
    }
  });
});

describe('hard rule — at least one rest or gentle-recovery day', () => {
  // Six demanding days and one rest day: filling the last free day must block.
  const packedWeek = (): SchedulingSession[] =>
    WEEK_DATES.map((date, index) =>
      session({
        id: `d${index}`,
        scheduledDate: date,
        sessionType: index === 6 ? 'rest' : 'strength',
      }),
    );

  it('blocks replacing the only recovery day with a demanding session', () => {
    const { hard } = codes(
      { kind: 'replace', sessionId: 'd6', toType: 'strength' },
      packedWeek(),
    );
    expect(hard).toContain('no-recovery-day');
    // Two strength on the same day is not created here — each day still has one.
    expect(hard).not.toContain('two-demanding-lower-body-same-day');
  });

  it('still passes when exactly one recovery day remains (boundary)', () => {
    // Replace a demanding day (keeping the Sunday rest) — one recovery day left.
    const { hard } = codes(
      { kind: 'replace', sessionId: 'd0', toType: 'cardio' },
      packedWeek(),
    );
    expect(hard).not.toContain('no-recovery-day');
  });

  it('does not fire for the ordinary seeded week', () => {
    const { hard } = codes(
      { kind: 'move', sessionId: 'thu', toDate: '2026-08-05' },
      baseWeek(),
    );
    expect(hard).not.toContain('no-recovery-day');
  });
});

describe('hard rule — no two demanding lower-body sessions on the same day', () => {
  it('blocks moving a strength session onto another strength day', () => {
    const { hard } = codes(
      { kind: 'move', sessionId: 'thu', toDate: '2026-08-03' },
      baseWeek(),
    );
    expect(hard).toContain('two-demanding-lower-body-same-day');
  });

  it('allows two strength sessions on different days', () => {
    const { hard } = codes(
      { kind: 'move', sessionId: 'thu', toDate: '2026-08-05' },
      baseWeek(),
    );
    expect(hard).not.toContain('two-demanding-lower-body-same-day');
  });

  it('ignores a skipped strength session sharing the day', () => {
    const week = baseWeek();
    // Skip Monday's strength, then move Thursday's strength onto Monday.
    const withSkip = week.map((s) =>
      s.id === 'mon' ? { ...s, status: 'skipped' } : s,
    );
    const { hard } = codes(
      { kind: 'move', sessionId: 'thu', toDate: '2026-08-03' },
      withSkip,
    );
    expect(hard).not.toContain('two-demanding-lower-body-same-day');
  });
});

describe('soft rule — avoid demanding lower-body the day before a run', () => {
  it('warns when a run lands the day after a strength session', () => {
    const week: SchedulingSession[] = [
      session({
        id: 'mon',
        scheduledDate: '2026-08-03',
        sessionType: 'strength',
      }),
      session({
        id: 'tue-run',
        scheduledDate: '2026-08-05',
        sessionType: 'running',
      }),
      session({ id: 'sun', scheduledDate: '2026-08-09', sessionType: 'rest' }),
    ];
    // Move the run from Wed to Tue — the day after Monday's strength.
    const { soft, result } = codes(
      { kind: 'move', sessionId: 'tue-run', toDate: '2026-08-04' },
      week,
    );
    expect(soft).toContain('lower-body-before-run');
    expect(result.canSave).toBe(true);
    expect(result.requiresAcknowledgement).toBe(true);
  });

  it('does not warn when the run is two days after the strength session', () => {
    const week: SchedulingSession[] = [
      session({
        id: 'mon',
        scheduledDate: '2026-08-03',
        sessionType: 'strength',
      }),
      session({
        id: 'run',
        scheduledDate: '2026-08-05',
        sessionType: 'running',
      }),
      session({ id: 'sun', scheduledDate: '2026-08-09', sessionType: 'rest' }),
    ];
    const { soft } = codes(
      { kind: 'move', sessionId: 'run', toDate: '2026-08-05' },
      week,
    );
    expect(soft).not.toContain('lower-body-before-run');
  });
});

describe('soft rule — three or fewer demanding sessions in the early phase', () => {
  it('allows exactly three demanding sessions (boundary)', () => {
    const week = baseWeek();
    // Base has two strength. Replace Tuesday cardio with strength => three.
    const { soft } = codes(
      { kind: 'replace', sessionId: 'tue', toType: 'strength' },
      week,
    );
    expect(soft).not.toContain('early-phase-demanding-limit');
  });

  it('warns on a fourth demanding session', () => {
    const week = baseWeek();
    // Add two extra strength sessions first, then the change adds a fourth.
    const withThree = [
      ...week,
      session({
        id: 'extra',
        scheduledDate: '2026-08-07',
        sessionType: 'strength',
      }),
    ];
    // Replace Saturday cardio with strength => four demanding.
    const { soft, result } = codes(
      { kind: 'replace', sessionId: 'sat', toType: 'strength' },
      withThree,
    );
    expect(soft).toContain('early-phase-demanding-limit');
    expect(result.canSave).toBe(true);
  });

  it('does not apply the cap outside the early phase', () => {
    const week = [
      ...baseWeek(),
      session({
        id: 'x',
        scheduledDate: '2026-08-07',
        sessionType: 'strength',
      }),
    ];
    const { soft } = codes(
      { kind: 'replace', sessionId: 'sat', toType: 'strength' },
      week,
      options({ isEarlyPhase: false }),
    );
    expect(soft).not.toContain('early-phase-demanding-limit');
  });
});

describe('skip and evaluation shape', () => {
  it('skipping a session never creates a conflict and is savable', () => {
    const { result } = codes({ kind: 'skip', sessionId: 'mon' }, baseWeek());
    expect(result.hard).toHaveLength(0);
    expect(result.canSave).toBe(true);
    expect(result.requiresAcknowledgement).toBe(false);
  });

  it('a hard conflict is never savable and never asks for acknowledgement', () => {
    const { result } = codes(
      { kind: 'move', sessionId: 'thu', toDate: '2026-08-03' },
      baseWeek(),
    );
    expect(result.canSave).toBe(false);
    expect(result.requiresAcknowledgement).toBe(false);
  });

  it('every conflict carries a plain, specific message and a severity', () => {
    const { result } = codes(
      { kind: 'move', sessionId: 'thu', toDate: '2026-08-03' },
      baseWeek(),
    );
    for (const conflict of [...result.hard, ...result.soft]) {
      expect(conflict.message.length).toBeGreaterThan(20);
      expect(conflict.message).not.toMatch(/invalid/i);
      expect(['hard', 'soft']).toContain(conflict.severity);
    }
  });
});

describe('seam — running and strength volume increase (docs/06 §6.5)', () => {
  it('warns only when both increase in the same week', () => {
    expect(
      evaluateVolumeIncrease({
        lowerBodyVolumeIncreased: true,
        runningStageIncreased: true,
      }),
    ).toMatchObject({ code: 'running-and-strength-volume', severity: 'soft' });
  });

  it('does not warn when only one increases', () => {
    expect(
      evaluateVolumeIncrease({
        lowerBodyVolumeIncreased: false,
        runningStageIncreased: true,
      }),
    ).toBeNull();
    expect(
      evaluateVolumeIncrease({
        lowerBodyVolumeIncreased: true,
        runningStageIncreased: false,
      }),
    ).toBeNull();
  });
});
