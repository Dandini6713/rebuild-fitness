import { describe, expect, it, jest } from '@jest/globals';

import {
  createPlanRepository,
  type PlanBackend,
} from '@/features/plan/planRepository';

const RANGE = { end: '2026-08-09', start: '2026-08-03' };

function backend(overrides: Partial<PlanBackend>): PlanBackend {
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
      async () => ({ data: [], error: null }),
    ),
    fetchTemplateSummaries: jest.fn<PlanBackend['fetchTemplateSummaries']>(
      async () => ({ data: [], error: null }),
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

describe('weekly planner repository — loadWeek', () => {
  it('reports empty when there is no active plan', async () => {
    const repo = createPlanRepository(
      backend({ fetchActivePlan: async () => ({ data: null, error: null }) }),
    );
    await expect(repo.loadWeek(RANGE)).resolves.toEqual({ status: 'empty' });
  });

  it('surfaces an error when the session read fails', async () => {
    const repo = createPlanRepository(
      backend({
        fetchSessionsByDateRange: async () => ({
          data: null,
          error: { message: 'network' },
        }),
      }),
    );
    const result = await repo.loadWeek(RANGE);
    expect(result.status).toBe('error');
  });

  it('lays out seven day slots with sessions, durations and template names', async () => {
    const repo = createPlanRepository(
      backend({
        fetchSessionsByDateRange: async () => ({
          data: [
            {
              id: 's-mon',
              scheduled_date: '2026-08-03',
              session_type: 'strength',
              status: 'planned',
              template_id: 't-a',
            },
            {
              id: 's-tue',
              scheduled_date: '2026-08-04',
              session_type: 'cardio',
              status: 'planned',
              template_id: null,
            },
          ],
          error: null,
        }),
        fetchTemplateSummaries: async () => ({
          data: [{ estimated_minutes: 45, id: 't-a', name: 'Strength A' }],
          error: null,
        }),
      }),
    );

    const result = await repo.loadWeek(RANGE);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }

    expect(result.week.days).toHaveLength(7);
    expect(result.week.weekDates[0]).toBe('2026-08-03');
    expect(result.week.weekDates[6]).toBe('2026-08-09');

    const monday = result.week.days[0];
    expect(monday?.isoDate).toBe('2026-08-03');
    expect(monday?.sessions[0]).toMatchObject({
      durationMinutes: 45,
      sessionType: 'strength',
      templateName: 'Strength A',
    });

    const tuesday = result.week.days[1];
    expect(tuesday?.sessions[0]).toMatchObject({
      durationMinutes: null,
      templateName: null,
    });

    // Sunday has nothing scheduled in this fixture.
    expect(result.week.days[6]?.sessions).toHaveLength(0);
    // The strength template is offered as a replacement option.
    expect(result.week.templates).toEqual([{ id: 't-a', name: 'Strength A' }]);
  });

  it('does not fetch template details when no session is template-backed', async () => {
    const fetchTemplateSummaries = jest.fn<
      PlanBackend['fetchTemplateSummaries']
    >(async () => ({ data: [], error: null }));
    const repo = createPlanRepository(
      backend({
        fetchSessionsByDateRange: async () => ({
          data: [
            {
              id: 's-sun',
              scheduled_date: '2026-08-09',
              session_type: 'rest',
              status: 'planned',
              template_id: null,
            },
          ],
          error: null,
        }),
        fetchTemplateSummaries,
      }),
    );
    await repo.loadWeek(RANGE);
    expect(fetchTemplateSummaries).not.toHaveBeenCalled();
  });
});

describe('weekly planner repository — mutations', () => {
  it('moves a session by updating its scheduled date', async () => {
    const updateSessionDate = jest.fn<PlanBackend['updateSessionDate']>(
      async () => ({ error: null }),
    );
    const repo = createPlanRepository(backend({ updateSessionDate }));
    const result = await repo.moveSession({
      sessionId: 's-1',
      toDate: '2026-08-05',
      userId: 'user-1',
    });
    expect(result).toEqual({ success: true });
    expect(updateSessionDate).toHaveBeenCalledWith({
      sessionId: 's-1',
      toDate: '2026-08-05',
      userId: 'user-1',
    });
  });

  it('reports a friendly error when a move write fails', async () => {
    const repo = createPlanRepository(
      backend({
        updateSessionDate: async () => ({ error: { message: 'boom' } }),
      }),
    );
    const result = await repo.moveSession({
      sessionId: 's-1',
      toDate: '2026-08-05',
      userId: 'user-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('could not save');
    }
  });

  it('skips a session', async () => {
    const skipScheduledSession = jest.fn<PlanBackend['skipScheduledSession']>(
      async () => ({ error: null }),
    );
    const repo = createPlanRepository(backend({ skipScheduledSession }));
    const result = await repo.skipSession({
      sessionId: 's-1',
      userId: 'user-1',
    });
    expect(result).toEqual({ success: true });
    expect(skipScheduledSession).toHaveBeenCalledWith({
      sessionId: 's-1',
      userId: 'user-1',
    });
  });

  it('replaces a session with a new type and template', async () => {
    const replaceScheduledSession = jest.fn<
      PlanBackend['replaceScheduledSession']
    >(async () => ({ error: null }));
    const repo = createPlanRepository(backend({ replaceScheduledSession }));
    const result = await repo.replaceSession({
      sessionId: 's-1',
      toTemplateId: 't-b',
      toType: 'strength',
      userId: 'user-1',
    });
    expect(result).toEqual({ success: true });
    expect(replaceScheduledSession).toHaveBeenCalledWith({
      sessionId: 's-1',
      toTemplateId: 't-b',
      toType: 'strength',
      userId: 'user-1',
    });
  });
});
