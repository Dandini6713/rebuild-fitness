// The weekly scheduling rules from docs/06 §6.5, as small pure functions with no
// React and no I/O — mirroring planSchedule.ts and todaySession.ts. The weekly
// planner (features/plan) calls these to decide whether a proposed move, replace
// or skip may be saved; it never reimplements the logic. Every rule is unit
// tested, including the boundaries (for example runs exactly one day apart versus
// two), because these decisions shape a real person's training week.
//
// A hard conflict must block the save. A soft conflict may be saved, but only
// after the user explicitly acknowledges it. Nothing here diagnoses, treats or
// assesses injury (docs/07); the rules only arrange sessions sensibly.
//
// Deliberately NOT implemented here (clean seams, not omissions):
//   - "A red readiness result cancels or replaces the affected session" (docs/06
//     §6.5, a hard rule). It depends on the readiness classification feature
//     (docs/06 §6.2), which is a later roadmap item. evaluateSchedulingChange
//     takes no readiness input; when readiness lands it becomes an extra hard
//     rule here, keyed off the day's classification.
//   - The soft warning "Avoid increasing both running stage and lower-body
//     strength volume in the same week" needs running-stage and strength-volume
//     figures that move/replace/skip do not change. It lives below as a separate
//     pure predicate (evaluateVolumeIncrease) so it is present and tested, ready
//     for the progression work (roadmap 12/17) to feed it real volumes; the
//     planner's scheduling actions never trigger it.

// How a session is classified for the scheduling rules. Derived purely from the
// session type (and, when future templates need it, the template — see the note
// on isDemandingLowerBody). Kept as one small mapping so a new session type is a
// one-line change here rather than a scattered set of string comparisons.
//
// Mapping, and why:
//   - running            → a run. A distinct session type, introduced only once
//                          the readiness gate opens running (docs/06 §6.3). The
//                          base plan's Friday/Saturday cardio is walking or
//                          run-walk, NOT a run, so 'cardio' is deliberately not
//                          treated as running; that would over-fire the
//                          consecutive-runs rule on ordinary walks.
//   - strength           → a demanding lower-body session. Both seeded persona
//                          templates (Strength A, Strength B) are compound
//                          sessions with substantial lower-body load — leg press
//                          and Romanian deadlift in A, step-ups and glute bridge
//                          in B (see seed_private_plan). So, in today's plan, a
//                          strength session IS a demanding lower-body session.
//                          When future templates add an upper-body-only day this
//                          needs a template-level flag; that is the seam, and the
//                          classifier takes the template name so it can grow into
//                          it without the call sites changing.
//   - achilles           → gentle Achilles strength and mobility. Low load, so it
//                          is a recovery day, never a demanding one.
//   - cardio             → walking or low-impact cardio. Not demanding and not a
//                          run; it simply carries no demanding load.
//   - rest               → a full rest day.
export type SessionClassification = {
  isRunning: boolean;
  isDemandingLowerBody: boolean;
  isDemanding: boolean;
  isRestOrRecovery: boolean;
};

export function classifySession(input: {
  sessionType: string;
  templateName?: string | null;
}): SessionClassification {
  const type = input.sessionType;
  const isRunning = type === 'running';
  // Strength days are demanding lower-body in the current plan (see mapping note).
  // The template name is accepted for the forthcoming upper-body-day distinction;
  // until such a template exists, every strength session qualifies.
  const isDemandingLowerBody = type === 'strength';
  const isDemanding = isRunning || isDemandingLowerBody;
  const isRestOrRecovery = type === 'rest' || type === 'achilles';
  return { isDemanding, isDemandingLowerBody, isRestOrRecovery, isRunning };
}

// Statuses that take a session out of the schedule: a skipped, cancelled or
// replaced session will not be performed, so it neither creates conflicts nor
// counts towards limits. Everything else (planned, in progress, completed) is
// live and does.
const INACTIVE_STATUSES = new Set(['skipped', 'cancelled', 'replaced']);

export function isActiveStatus(status: string): boolean {
  return !INACTIVE_STATUSES.has(status);
}

export type SchedulingSession = {
  id: string;
  scheduledDate: string;
  sessionType: string;
  status: string;
  templateName?: string | null;
};

// The three changes the weekly planner can propose. Move changes a session's
// date, replace changes its type, skip removes it from the week. Persistence of
// each lives in the repository; here we only reason about the resulting schedule.
export type SchedulingChange =
  | { kind: 'move'; sessionId: string; toDate: string }
  | { kind: 'replace'; sessionId: string; toType: string }
  | { kind: 'skip'; sessionId: string };

export type Severity = 'hard' | 'soft';

export type SchedulingConflict = {
  code: string;
  severity: Severity;
  message: string;
};

export type SchedulingEvaluation = {
  hard: SchedulingConflict[];
  soft: SchedulingConflict[];
  // hard.length === 0. A hard conflict is never savable.
  canSave: boolean;
  // soft.length > 0 with no hard conflict: savable, but only after the user
  // acknowledges the warning.
  requiresAcknowledgement: boolean;
};

export type EvaluateOptions = {
  // The seven calendar dates (YYYY-MM-DD) of the window being planned, so the
  // rest-day rule can see days that hold no session at all.
  weekDates: readonly string[];
  // The initial walking/low-impact phase (docs/06 §6.3), during which the
  // demanding-session cap applies. Derived by the caller; see useWeeklyPlan.
  isEarlyPhase: boolean;
  // "Three or fewer" demanding sessions in the early phase (docs/06 §6.5).
  earlyPhaseDemandingLimit?: number;
};

const DAY_MS = 24 * 60 * 60 * 1000;

// A plain calendar date as a whole day number, parsed at UTC midnight so a date's
// day never shifts with the device time zone (mirrors formatPlanDate). Used only
// for adjacency arithmetic, never for display.
function toDayNumber(isoDate: string): number {
  const date = new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid date: ${isoDate}`);
  }
  return Math.round(date.getTime() / DAY_MS);
}

// Apply a proposed change to the week and return the sessions that would be live
// afterwards. Skipped/cancelled/replaced sessions are dropped first so they do
// not colour the result.
function applyChange(
  sessions: readonly SchedulingSession[],
  change: SchedulingChange,
): SchedulingSession[] {
  const live = sessions.filter((session) => isActiveStatus(session.status));
  if (change.kind === 'skip') {
    return live.filter((session) => session.id !== change.sessionId);
  }
  return live.map((session) => {
    if (session.id !== change.sessionId) {
      return session;
    }
    if (change.kind === 'move') {
      return { ...session, scheduledDate: change.toDate };
    }
    return { ...session, sessionType: change.toType };
  });
}

function classify(session: SchedulingSession): SessionClassification {
  return classifySession({
    sessionType: session.sessionType,
    templateName: session.templateName ?? null,
  });
}

// Hard: no two running sessions on consecutive days (docs/06 §6.5, and §6.3
// "Runs should not be scheduled on consecutive days"). Exactly one day apart is a
// conflict; two days apart is fine.
function checkRunningConsecutiveDays(
  active: readonly SchedulingSession[],
): SchedulingConflict | null {
  const runDays = Array.from(
    new Set(
      active
        .filter((session) => classify(session).isRunning)
        .map((session) => toDayNumber(session.scheduledDate)),
    ),
  ).sort((a, b) => a - b);
  for (let i = 1; i < runDays.length; i += 1) {
    const previous = runDays[i - 1];
    const current = runDays[i];
    if (
      previous !== undefined &&
      current !== undefined &&
      current - previous === 1
    ) {
      return {
        code: 'running-consecutive-days',
        message:
          'This would place two running sessions on consecutive days. Runs need a day between them, so please pick another day.',
        severity: 'hard',
      };
    }
  }
  return null;
}

// Hard: at least one full rest or gentle-recovery day per seven-day period
// (docs/06 §6.5). A day qualifies when it carries no demanding session — a rest
// day, an Achilles or walk day, or a day with nothing scheduled. Only violated
// when every day in the window would hold a demanding session.
function checkRestDay(
  active: readonly SchedulingSession[],
  weekDates: readonly string[],
): SchedulingConflict | null {
  if (weekDates.length === 0) {
    return null;
  }
  const demandingDays = new Set(
    active
      .filter((session) => classify(session).isDemanding)
      .map((session) => session.scheduledDate),
  );
  const hasRecoveryDay = weekDates.some((date) => !demandingDays.has(date));
  if (hasRecoveryDay) {
    return null;
  }
  return {
    code: 'no-recovery-day',
    message:
      'This would leave no rest or gentle-recovery day this week. Every seven-day period needs at least one, so please keep a lighter day free.',
    severity: 'hard',
  };
}

// Hard: do not schedule two demanding lower-body sessions on the same day
// (docs/06 §6.5). Two on one day is a conflict; on separate days is fine.
function checkTwoDemandingLowerBodySameDay(
  active: readonly SchedulingSession[],
): SchedulingConflict | null {
  const perDay = new Map<string, number>();
  for (const session of active) {
    if (classify(session).isDemandingLowerBody) {
      perDay.set(
        session.scheduledDate,
        (perDay.get(session.scheduledDate) ?? 0) + 1,
      );
    }
  }
  for (const count of perDay.values()) {
    if (count >= 2) {
      return {
        code: 'two-demanding-lower-body-same-day',
        message:
          'This would schedule two demanding lower-body sessions on the same day. Please move one of them to a different day.',
        severity: 'hard',
      };
    }
  }
  return null;
}

// Soft: avoid a demanding lower-body session the day before a run (docs/06 §6.5).
// Warns when a run sits exactly one day after a demanding lower-body session.
function checkLowerBodyBeforeRun(
  active: readonly SchedulingSession[],
): SchedulingConflict | null {
  const lowerBodyDays = new Set(
    active
      .filter((session) => classify(session).isDemandingLowerBody)
      .map((session) => toDayNumber(session.scheduledDate)),
  );
  const runsAfterLowerBody = active.some((session) => {
    if (!classify(session).isRunning) {
      return false;
    }
    return lowerBodyDays.has(toDayNumber(session.scheduledDate) - 1);
  });
  if (!runsAfterLowerBody) {
    return null;
  }
  return {
    code: 'lower-body-before-run',
    message:
      'This places a demanding lower-body session the day before a run. Your legs may still be tired, so you might prefer to leave a day between them.',
    severity: 'soft',
  };
}

// Soft: keep demanding sessions to three or fewer during the early phase
// (docs/06 §6.5). Exactly three is fine; a fourth warns. Only applies while the
// plan is in its early, walking-led phase.
function checkEarlyPhaseDemandingLimit(
  active: readonly SchedulingSession[],
  options: EvaluateOptions,
): SchedulingConflict | null {
  if (!options.isEarlyPhase) {
    return null;
  }
  const limit = options.earlyPhaseDemandingLimit ?? 3;
  const demanding = active.filter((session) => classify(session).isDemanding);
  if (demanding.length <= limit) {
    return null;
  }
  return {
    code: 'early-phase-demanding-limit',
    message: `This would give you ${demanding.length} demanding sessions this week. Early on, keeping to ${limit} or fewer helps you recover well between them.`,
    severity: 'soft',
  };
}

// Evaluate a proposed change against the week and return its hard and soft
// conflicts. The caller uses canSave to block hard conflicts outright and
// requiresAcknowledgement to gate soft ones behind an explicit confirmation.
export function evaluateSchedulingChange(
  change: SchedulingChange,
  sessions: readonly SchedulingSession[],
  options: EvaluateOptions,
): SchedulingEvaluation {
  const active = applyChange(sessions, change);

  const hard = [
    checkRunningConsecutiveDays(active),
    checkRestDay(active, options.weekDates),
    checkTwoDemandingLowerBodySameDay(active),
  ].filter((conflict): conflict is SchedulingConflict => conflict !== null);

  const soft = [
    checkLowerBodyBeforeRun(active),
    checkEarlyPhaseDemandingLimit(active, options),
  ].filter((conflict): conflict is SchedulingConflict => conflict !== null);

  return {
    canSave: hard.length === 0,
    hard,
    requiresAcknowledgement: hard.length === 0 && soft.length > 0,
    soft,
  };
}

// Soft (seam, see the header note): avoid increasing both running stage and
// lower-body strength volume in the same week (docs/06 §6.5 and §6.3). Pure and
// tested, but not wired into evaluateSchedulingChange because moving, replacing
// or skipping a session changes neither running stage nor strength volume. The
// progression work (roadmap 12/17) will supply the real increases.
export function evaluateVolumeIncrease(input: {
  runningStageIncreased: boolean;
  lowerBodyVolumeIncreased: boolean;
}): SchedulingConflict | null {
  if (input.runningStageIncreased && input.lowerBodyVolumeIncreased) {
    return {
      code: 'running-and-strength-volume',
      message:
        'This increases both your running and your lower-body strength in the same week. Building both at once can be a lot to recover from, so consider easing one of them.',
      severity: 'soft',
    };
  }
  return null;
}
