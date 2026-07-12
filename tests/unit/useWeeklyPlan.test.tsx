import { act, renderHook, waitFor } from '@testing-library/react-native';
import { describe, expect, it, jest } from '@jest/globals';

import {
  createPlanRepository,
  type PlanBackend,
} from '@/features/plan/planRepository';
import { useWeeklyPlan } from '@/features/plan/useWeeklyPlan';

// A signed-in user, so the hook loads and the writes carry an owner id.
jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => ({ session: { user: { id: 'user-1' } } }),
}));

// Wednesday within the week 2026-08-03 (Mon) to 2026-08-09 (Sun).
const NOW = new Date(2026, 7, 5, 9, 0);

// The seeded week: strength Mon/Thu, cardio Tue/Fri/Sat, achilles Wed, rest Sun.
const WEEK_ROWS = [
  { date: '2026-08-03', type: 'strength', id: 'mon' },
  { date: '2026-08-04', type: 'cardio', id: 'tue' },
  { date: '2026-08-05', type: 'achilles', id: 'wed' },
  { date: '2026-08-06', type: 'strength', id: 'thu' },
  { date: '2026-08-07', type: 'cardio', id: 'fri' },
  { date: '2026-08-08', type: 'cardio', id: 'sat' },
  { date: '2026-08-09', type: 'rest', id: 'sun' },
];

function backend(overrides: Partial<PlanBackend> = {}): PlanBackend {
  return {
    seed: jest.fn<PlanBackend['seed']>(async () => ({
      data: 'plan-1',
      error: null,
    })),
    fetchActivePlan: jest.fn<PlanBackend['fetchActivePlan']>(async () => ({
      data: {
        id: 'plan-1',
        name: 'Rebuild base plan',
        starts_on: '2026-08-03',
      },
      error: null,
    })),
    fetchWeeks: jest.fn<PlanBackend['fetchWeeks']>(async () => ({
      data: [],
      error: null,
    })),
    fetchSessions: jest.fn<PlanBackend['fetchSessions']>(async () => ({
      data: [],
      error: null,
    })),
    fetchTemplates: jest.fn<PlanBackend['fetchTemplates']>(async () => ({
      data: [],
      error: null,
    })),
    fetchSessionsByDateRange: jest.fn<PlanBackend['fetchSessionsByDateRange']>(
      async () => ({
        data: WEEK_ROWS.map((row) => ({
          id: row.id,
          scheduled_date: row.date,
          session_type: row.type,
          status: 'planned' as const,
          template_id: row.type === 'strength' ? 't-a' : null,
        })),
        error: null,
      }),
    ),
    fetchTemplateSummaries: jest.fn<PlanBackend['fetchTemplateSummaries']>(
      async () => ({
        data: [{ estimated_minutes: 45, id: 't-a', name: 'Strength A' }],
        error: null,
      }),
    ),
    updateSessionDate: jest.fn<PlanBackend['updateSessionDate']>(async () => ({
      error: null,
    })),
    skipScheduledSession: jest.fn<PlanBackend['skipScheduledSession']>(
      async () => ({ error: null }),
    ),
    replaceScheduledSession: jest.fn<PlanBackend['replaceScheduledSession']>(
      async () => ({ error: null }),
    ),
    ...overrides,
  };
}

async function renderLoaded(back: PlanBackend) {
  const repo = createPlanRepository(back);
  const hook = await renderHook(() => useWeeklyPlan(NOW, repo));
  await waitFor(() => expect(hook.result.current.state.status).toBe('ready'));
  return hook;
}

describe('useWeeklyPlan — enforcement', () => {
  it('persists a clean change and never asks for confirmation', async () => {
    const back = backend();
    const hook = await renderLoaded(back);

    await act(async () => {
      hook.result.current.requestChange({ kind: 'skip', sessionId: 'tue' });
    });

    expect(back.skipScheduledSession).toHaveBeenCalledWith({
      sessionId: 'tue',
      userId: 'user-1',
    });
  });

  it('blocks a hard conflict and never writes it', async () => {
    const back = backend();
    const hook = await renderLoaded(back);

    // Moving Thursday's strength onto Monday's strength: two demanding lower-body
    // sessions on one day — a hard conflict.
    await act(async () => {
      hook.result.current.requestChange({
        kind: 'move',
        sessionId: 'thu',
        toDate: '2026-08-03',
      });
    });

    expect(hook.result.current.action.kind).toBe('blocked');
    expect(back.updateSessionDate).not.toHaveBeenCalled();
  });

  it('holds a soft conflict pending acknowledgement, then saves on confirm', async () => {
    // Give the week a run on Wednesday so moving it to Tuesday lands it the day
    // after Monday's strength — a soft "lower body before a run" warning.
    const back = backend({
      fetchSessionsByDateRange: async () => ({
        data: [
          {
            id: 'mon',
            scheduled_date: '2026-08-03',
            session_type: 'strength',
            status: 'planned',
            template_id: 't-a',
          },
          {
            id: 'wed-run',
            scheduled_date: '2026-08-05',
            session_type: 'running',
            status: 'planned',
            template_id: null,
          },
          {
            id: 'sun',
            scheduled_date: '2026-08-09',
            session_type: 'rest',
            status: 'planned',
            template_id: null,
          },
        ],
        error: null,
      }),
    });
    const hook = await renderLoaded(back);

    await act(async () => {
      hook.result.current.requestChange({
        kind: 'move',
        sessionId: 'wed-run',
        toDate: '2026-08-04',
      });
    });

    // A soft warning does not write yet; it waits for the user.
    expect(hook.result.current.action.kind).toBe('confirm');
    expect(back.updateSessionDate).not.toHaveBeenCalled();

    await act(async () => {
      hook.result.current.confirmChange();
    });

    expect(back.updateSessionDate).toHaveBeenCalledWith({
      sessionId: 'wed-run',
      toDate: '2026-08-04',
      userId: 'user-1',
    });
  });
});
