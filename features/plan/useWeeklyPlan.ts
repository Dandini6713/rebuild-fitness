// Drives the weekly planner (S-020): loads the current seven-day window for the
// signed-in user, owns which session's detail sheet is open, and runs every
// proposed move, replace or skip through the pure scheduling rules before it
// touches the database. Mirrors useToday for loading and unavailable handling;
// offline is handled by the screen.
//
// The rule distinction is enforced here, not in the view: a hard conflict never
// reaches the repository (the action is blocked with its explanation); a soft
// conflict is held pending an explicit acknowledgement; a clean change saves and
// the week reloads. A soft warning can therefore never silently block, and a hard
// conflict can never slip through.

import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  currentWeekRange,
  formatPlanDate,
  type PlanSessionType,
} from '@/domain/training/planSchedule';
import { toIsoDate } from '@/domain/training/todaySession';
import {
  evaluateSchedulingChange,
  type SchedulingChange,
  type SchedulingConflict,
  type SchedulingSession,
} from '@/domain/training/schedulingRules';
import { useAuth } from '@/features/auth/AuthProvider';

import { defaultPlanRepository } from './defaultPlanRepository';
import type { PlannerWeek, PlanRepository, WeekResult } from './planRepository';

// The whole plan is currently in its early, walking-led phase (docs/06 §6.3):
// running is only enabled once the readiness gate is built (a later roadmap item),
// so the early-phase demanding-session cap always applies for now. When running
// progression lands this becomes a per-week derivation rather than a constant.
const IS_EARLY_PHASE = true;

export type WeekViewState =
  { status: 'loading' } | { status: 'unavailable' } | WeekResult;

// A planner action carries everything persistence needs; the scheduling rules
// only look at the subset that changes the schedule (see toSchedulingChange).
export type PlannerAction =
  | { kind: 'move'; sessionId: string; toDate: string }
  | {
      kind: 'replace';
      sessionId: string;
      toType: PlanSessionType;
      toTemplateId: string | null;
    }
  | { kind: 'skip'; sessionId: string };

export type PlannerActionState =
  | { kind: 'idle' }
  // A hard conflict: the change cannot be saved; the explanation is shown.
  | { kind: 'blocked'; conflicts: SchedulingConflict[] }
  // A soft conflict: savable, but only once the user acknowledges the warning.
  | { kind: 'confirm'; conflicts: SchedulingConflict[]; action: PlannerAction }
  | { kind: 'saving' };

export type UseWeeklyPlanValue = {
  state: WeekViewState;
  weekLabel: string;
  selectedSessionId: string | null;
  action: PlannerActionState;
  actionError: string | null;
  openDetails: (sessionId: string) => void;
  closeDetails: () => void;
  requestChange: (action: PlannerAction) => void;
  confirmChange: () => void;
  dismissConflict: () => void;
};

function toSchedulingChange(action: PlannerAction): SchedulingChange {
  if (action.kind === 'move') {
    return { kind: 'move', sessionId: action.sessionId, toDate: action.toDate };
  }
  if (action.kind === 'replace') {
    return {
      kind: 'replace',
      sessionId: action.sessionId,
      toType: action.toType,
    };
  }
  return { kind: 'skip', sessionId: action.sessionId };
}

function weekSessionsOf(week: PlannerWeek): SchedulingSession[] {
  return week.days.flatMap((day) =>
    day.sessions.map((session) => ({
      id: session.id,
      scheduledDate: session.scheduledDate,
      sessionType: session.sessionType,
      status: session.status,
      templateName: session.templateName,
    })),
  );
}

export function useWeeklyPlan(
  now: Date = new Date(),
  repository: PlanRepository | null = defaultPlanRepository,
): UseWeeklyPlanValue {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [reference] = useState(now);
  const range = useMemo(
    () => currentWeekRange(toIsoDate(reference)),
    [reference],
  );
  const weekLabel = useMemo(
    () => `Week of ${formatPlanDate(range.start)}`,
    [range.start],
  );

  const [reloadCount, setReloadCount] = useState(0);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  );
  const [action, setAction] = useState<PlannerActionState>({ kind: 'idle' });
  const [actionError, setActionError] = useState<string | null>(null);

  const requestKey = `${userId ?? ''}:${range.start}:${reloadCount}`;
  const [fetched, setFetched] = useState<{
    key: string;
    result: WeekResult;
  } | null>(null);

  useEffect(() => {
    if (!repository || !userId) {
      return;
    }
    let active = true;
    void repository.loadWeek(range).then((result) => {
      if (active) {
        setFetched({ key: requestKey, result });
      }
    });
    return () => {
      active = false;
    };
  }, [range, repository, requestKey, userId]);

  let state: WeekViewState;
  if (!repository) {
    state = { status: 'unavailable' };
  } else if (!userId || !fetched || fetched.key !== requestKey) {
    state = { status: 'loading' };
  } else {
    state = fetched.result;
  }

  const readyWeek = state.status === 'ready' ? state.week : null;

  const persist = useCallback(
    (act: PlannerAction) => {
      if (!repository || !userId) {
        return;
      }
      setAction({ kind: 'saving' });
      setActionError(null);
      const result =
        act.kind === 'move'
          ? repository.moveSession({
              sessionId: act.sessionId,
              toDate: act.toDate,
              userId,
            })
          : act.kind === 'skip'
            ? repository.skipSession({ sessionId: act.sessionId, userId })
            : repository.replaceSession({
                sessionId: act.sessionId,
                toTemplateId: act.toTemplateId,
                toType: act.toType,
                userId,
              });
      void result.then((outcome) => {
        if (outcome.success) {
          setAction({ kind: 'idle' });
          setSelectedSessionId(null);
          setReloadCount((count) => count + 1);
        } else {
          setAction({ kind: 'idle' });
          setActionError(outcome.message);
        }
      });
    },
    [repository, userId],
  );

  const requestChange = useCallback(
    (act: PlannerAction) => {
      if (!readyWeek) {
        return;
      }
      setActionError(null);
      const evaluation = evaluateSchedulingChange(
        toSchedulingChange(act),
        weekSessionsOf(readyWeek),
        { isEarlyPhase: IS_EARLY_PHASE, weekDates: readyWeek.weekDates },
      );
      if (!evaluation.canSave) {
        setAction({ conflicts: evaluation.hard, kind: 'blocked' });
        return;
      }
      if (evaluation.requiresAcknowledgement) {
        setAction({ action: act, conflicts: evaluation.soft, kind: 'confirm' });
        return;
      }
      persist(act);
    },
    [persist, readyWeek],
  );

  const confirmChange = useCallback(() => {
    if (action.kind === 'confirm') {
      persist(action.action);
    }
  }, [action, persist]);

  const dismissConflict = useCallback(() => {
    setAction({ kind: 'idle' });
  }, []);

  const openDetails = useCallback((sessionId: string) => {
    setSelectedSessionId(sessionId);
    setAction({ kind: 'idle' });
    setActionError(null);
  }, []);

  const closeDetails = useCallback(() => {
    setSelectedSessionId(null);
    setAction({ kind: 'idle' });
    setActionError(null);
  }, []);

  return {
    action,
    actionError,
    closeDetails,
    confirmChange,
    dismissConflict,
    openDetails,
    requestChange,
    selectedSessionId,
    state,
    weekLabel,
  };
}
