import { describe, expect, it, jest } from '@jest/globals';

import {
  createPlanRepository,
  type PlanBackend,
} from '@/features/plan/planRepository';

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
    ...overrides,
  };
}

describe('plan repository — seeding', () => {
  it('returns the new plan id on success', async () => {
    const repo = createPlanRepository(backend({}));
    const result = await repo.seedPrivatePlan({
      reset: false,
      startDate: '2026-08-03',
    });
    expect(result).toEqual({ planId: 'plan-1', success: true });
  });

  it('surfaces a friendly error when seeding fails', async () => {
    const repo = createPlanRepository(
      backend({
        seed: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    );
    const result = await repo.seedPrivatePlan({
      reset: false,
      startDate: '2026-08-03',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('could not prepare');
    }
  });
});

describe('plan repository — preview', () => {
  it('reports empty when there is no active plan', async () => {
    const repo = createPlanRepository(
      backend({ fetchActivePlan: async () => ({ data: null, error: null }) }),
    );
    await expect(repo.loadPreview(4)).resolves.toEqual({ status: 'empty' });
  });

  it('reports an error when the plan read fails', async () => {
    const repo = createPlanRepository(
      backend({
        fetchActivePlan: async () => ({
          data: null,
          error: { message: 'network' },
        }),
      }),
    );
    const result = await repo.loadPreview(4);
    expect(result.status).toBe('error');
  });

  it('composes weeks, sorted sessions and template names', async () => {
    const repo = createPlanRepository(
      backend({
        fetchWeeks: async () => ({
          // Returned out of order to prove the repository sorts them.
          data: [
            { id: 'w2', week_number: 2, starts_on: '2026-08-10' },
            { id: 'w1', week_number: 1, starts_on: '2026-08-03' },
          ],
          error: null,
        }),
        fetchSessions: async () => ({
          data: [
            {
              id: 's-tue',
              plan_week_id: 'w1',
              template_id: null,
              scheduled_date: '2026-08-04',
              session_type: 'cardio',
            },
            {
              id: 's-mon',
              plan_week_id: 'w1',
              template_id: 't-a',
              scheduled_date: '2026-08-03',
              session_type: 'strength',
            },
            {
              id: 's-w2',
              plan_week_id: 'w2',
              template_id: 't-b',
              scheduled_date: '2026-08-13',
              session_type: 'strength',
            },
          ],
          error: null,
        }),
        fetchTemplates: async () => ({
          data: [
            { id: 't-a', name: 'Strength A' },
            { id: 't-b', name: 'Strength B' },
          ],
          error: null,
        }),
      }),
    );

    const result = await repo.loadPreview(4);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }

    expect(result.preview.weeks.map((week) => week.weekNumber)).toEqual([1, 2]);

    const [weekOne] = result.preview.weeks;
    // Sessions within a week are ordered by date: Monday strength before Tuesday.
    expect(weekOne?.sessions.map((session) => session.id)).toEqual([
      's-mon',
      's-tue',
    ]);
    expect(weekOne?.sessions[0]?.templateName).toBe('Strength A');
    expect(weekOne?.sessions[1]?.templateName).toBeNull();
  });

  it('only fetches template names when a session is template-backed', async () => {
    const fetchTemplates = jest.fn<PlanBackend['fetchTemplates']>(async () => ({
      data: [],
      error: null,
    }));
    const repo = createPlanRepository(
      backend({
        fetchWeeks: async () => ({
          data: [{ id: 'w1', week_number: 1, starts_on: '2026-08-03' }],
          error: null,
        }),
        fetchSessions: async () => ({
          data: [
            {
              id: 's-rest',
              plan_week_id: 'w1',
              template_id: null,
              scheduled_date: '2026-08-09',
              session_type: 'rest',
            },
          ],
          error: null,
        }),
        fetchTemplates,
      }),
    );

    await repo.loadPreview(4);
    expect(fetchTemplates).not.toHaveBeenCalled();
  });
});
