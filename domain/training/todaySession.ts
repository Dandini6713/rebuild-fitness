// Pure derivations for the Today screen. Everything here is a small, testable
// function with no React and no I/O, mirroring domain/training/planSchedule.ts
// and the onboarding derivations. The read model and the view call these; they do
// not reimplement the logic.
//
// Nothing here diagnoses, treats or assesses injury (docs/07). The Achilles day is
// handled purely as a scheduling label; the readiness classification (docs/06 §6.2)
// is a later roadmap item and is deliberately not faked here.

// The device's current calendar date as YYYY-MM-DD, in the device's local time, so
// "today" matches the day the user is actually living in. Pure given `now` so the
// screen can be tested at any date. Dates are stored in UTC elsewhere, but the
// user's sense of "today" is local (AGENTS.md: display in the user's time zone).
export function toIsoDate(now: Date): string {
  const year = now.getFullYear();
  const month = `${now.getMonth() + 1}`.padStart(2, '0');
  const day = `${now.getDate()}`.padStart(2, '0');
  return `${year}-${month}-${day}`;
}

// A British-English greeting keyed to the local hour (0–23). Neutral and never
// appearance-based (docs/07); this is a friendly opener, not a judgement.
export function deriveGreeting(hour: number): string {
  if (hour < 12) {
    return 'Good morning';
  }
  if (hour < 18) {
    return 'Good afternoon';
  }
  return 'Good evening';
}

export type TodaySession = {
  id: string;
  scheduledDate: string;
  sessionType: string;
  status: string;
  templateName: string | null;
};

export type TodayLog = { status: string };

// The explicit, mutually exclusive states Today can be in for the day's session.
// A rest day is its own calm state, never an empty error. `none` means nothing is
// scheduled at all (before the plan starts, on a gap day, or with no plan yet).
export type TodaySessionState =
  | { kind: 'none' }
  | { kind: 'rest'; session: TodaySession }
  | { kind: 'completed'; session: TodaySession }
  | { kind: 'active'; inProgress: boolean; session: TodaySession };

// Rest vs training vs completed is driven by the session type and any matching
// workout log: a completed log (or a session already marked completed) is the
// completed state; an in-progress log means the session is under way. Kept
// deterministic so each branch is unit-tested.
export function deriveTodaySessionState(
  session: TodaySession | null,
  log: TodayLog | null,
): TodaySessionState {
  if (!session) {
    return { kind: 'none' };
  }
  if (log?.status === 'completed' || session.status === 'completed') {
    return { kind: 'completed', session };
  }
  if (session.sessionType === 'rest') {
    return { kind: 'rest', session };
  }
  return { inProgress: log?.status === 'in_progress', kind: 'active', session };
}

export type WeekSession = { id: string; sessionType: string };
export type WeekLog = { scheduledSessionId: string | null; status: string };

export type WeeklyAdherence = {
  completed: number;
  planned: number;
  // Null when the week has no training sessions to adhere to, so the UI can say
  // "nothing planned yet" rather than a misleading 0 per cent.
  percent: number | null;
};

// Weekly adherence is completed training sessions over planned training sessions
// for the current week. Rest days are excluded — a rest day is not something to
// adhere to. This is the "Weekly adherence" pure module docs/04 §4.2 asks for and
// the input the calorie rules (docs/06 §6.7) later read.
export function computeWeeklyAdherence(
  sessions: readonly WeekSession[],
  logs: readonly WeekLog[],
): WeeklyAdherence {
  const training = sessions.filter((session) => session.sessionType !== 'rest');
  const completedSessionIds = new Set(
    logs
      .filter((log) => log.status === 'completed' && log.scheduledSessionId)
      .map((log) => log.scheduledSessionId as string),
  );
  const completed = training.filter((session) =>
    completedSessionIds.has(session.id),
  ).length;
  const planned = training.length;
  const percent =
    planned === 0 ? null : Math.round((completed / planned) * 100);
  return { completed, planned, percent };
}
