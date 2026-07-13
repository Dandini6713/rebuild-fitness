import { describe, expect, it, jest } from '@jest/globals';

import {
  createTodayRepository,
  type TodayBackend,
} from '@/features/today/todayRepository';

const TODAY = '2026-07-15'; // Wednesday; week runs 2026-07-13 to 2026-07-19.

function backend(overrides: Partial<TodayBackend>): TodayBackend {
  return {
    fetchWeekSessions: jest.fn<TodayBackend['fetchWeekSessions']>(async () => ({
      data: [],
      error: null,
    })),
    fetchWeekLogs: jest.fn<TodayBackend['fetchWeekLogs']>(async () => ({
      data: [],
      error: null,
    })),
    fetchTemplates: jest.fn<TodayBackend['fetchTemplates']>(async () => ({
      data: [],
      error: null,
    })),
    fetchCurrentTargets: jest.fn<TodayBackend['fetchCurrentTargets']>(
      async () => ({ data: [], error: null }),
    ),
    fetchDayNutrition: jest.fn<TodayBackend['fetchDayNutrition']>(async () => ({
      data: [],
      error: null,
    })),
    startSession: jest.fn<TodayBackend['startSession']>(async () => ({
      data: { id: 'log-1' },
      error: null,
    })),
    ...overrides,
  };
}

describe('today repository — load', () => {
  it('surfaces an error when the session read fails', async () => {
    const repo = createTodayRepository(
      backend({
        fetchWeekSessions: async () => ({
          data: null,
          error: { message: 'network' },
        }),
      }),
    );
    const result = await repo.load(TODAY);
    expect(result.status).toBe('error');
  });

  it('reports none when nothing is scheduled today', async () => {
    const repo = createTodayRepository(backend({}));
    const result = await repo.load(TODAY);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.data.session).toEqual({ kind: 'none' });
    expect(result.data.nutrition).toEqual({ kind: 'no-target' });
    expect(result.data.adherence.percent).toBeNull();
  });

  it('resolves today from the week and attaches its template name', async () => {
    const fetchTemplates = jest.fn<TodayBackend['fetchTemplates']>(
      async () => ({
        data: [{ id: 't-a', name: 'Strength A' }],
        error: null,
      }),
    );
    const repo = createTodayRepository(
      backend({
        fetchWeekSessions: async () => ({
          data: [
            {
              id: 's-mon',
              scheduled_date: '2026-07-13',
              session_type: 'strength',
              status: 'planned',
              template_id: 't-a',
            },
            {
              id: 's-wed',
              scheduled_date: '2026-07-15',
              session_type: 'achilles',
              status: 'planned',
              template_id: null,
            },
          ],
          error: null,
        }),
        fetchTemplates,
      }),
    );

    const result = await repo.load(TODAY);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    // Today is Wednesday's Achilles session (no template), active and not started.
    expect(result.data.session).toEqual({
      inProgress: false,
      kind: 'active',
      session: {
        id: 's-wed',
        scheduledDate: '2026-07-15',
        sessionType: 'achilles',
        status: 'planned',
        templateName: null,
      },
    });
    // Templates are only fetched for today's session, and only when it has one.
    expect(fetchTemplates).not.toHaveBeenCalled();
  });

  it('shows the live replacement, not the replaced original, after an amber swap', async () => {
    // Roadmap 15: a substitution leaves the original 'replaced' alongside its live
    // 'planned' replacement on the same date. Today shows the replacement and the
    // superseded original does not count towards adherence.
    const repo = createTodayRepository(
      backend({
        fetchWeekSessions: async () => ({
          data: [
            {
              id: 's-orig',
              scheduled_date: '2026-07-15',
              session_type: 'strength',
              status: 'replaced',
              template_id: null,
            },
            {
              id: 's-repl',
              scheduled_date: '2026-07-15',
              session_type: 'cardio',
              status: 'planned',
              template_id: null,
            },
          ],
          error: null,
        }),
      }),
    );

    const result = await repo.load(TODAY);
    expect(result.status).toBe('ready');
    if (result.status !== 'ready') {
      return;
    }
    expect(result.data.session).toEqual({
      inProgress: false,
      kind: 'active',
      session: {
        id: 's-repl',
        scheduledDate: '2026-07-15',
        sessionType: 'cardio',
        status: 'planned',
        templateName: null,
      },
    });
    // Only the live replacement counts as planned; the replaced original is excluded.
    expect(result.data.adherence.planned).toBe(1);
  });

  it('marks today completed when a matching log is completed', async () => {
    const repo = createTodayRepository(
      backend({
        fetchWeekSessions: async () => ({
          data: [
            {
              id: 's-wed',
              scheduled_date: '2026-07-15',
              session_type: 'strength',
              status: 'planned',
              template_id: null,
            },
          ],
          error: null,
        }),
        fetchWeekLogs: async () => ({
          data: [
            { id: 'l-1', scheduled_session_id: 's-wed', status: 'completed' },
          ],
          error: null,
        }),
      }),
    );

    const result = await repo.load(TODAY);
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.data.session.kind).toBe('completed');
    expect(result.data.adherence).toEqual({
      completed: 1,
      percent: 100,
      planned: 1,
    });
  });

  it('builds the current nutrition target with real intake summed from the day', async () => {
    // Roadmap 19 closed the intake seam: Today sums today's nutrition_logs and shows
    // progress against the current effective target, not just the target.
    const repo = createTodayRepository(
      backend({
        fetchCurrentTargets: async () => ({
          data: [
            { calories: 2200, effective_from: '2026-06-01', protein_g: 140 },
            { calories: 2100, effective_from: '2026-07-01', protein_g: 145 },
          ],
          error: null,
        }),
        fetchDayNutrition: async () => ({
          data: [
            { calories: 500, protein_g: 30 },
            { calories: 700, protein_g: 45.5 },
          ],
          error: null,
        }),
      }),
    );

    const result = await repo.load(TODAY);
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    expect(result.data.nutrition).toEqual({
      calories: 2100,
      caloriesProgress: {
        consumed: 1200,
        percent: 57,
        remaining: 900,
        target: 2100,
      },
      effectiveFrom: '2026-07-01',
      kind: 'target',
      proteinG: 145,
      proteinProgress: {
        consumed: 75.5,
        percent: 52,
        remaining: 69.5,
        target: 145,
      },
    });
  });

  it('shows zero-of-target progress on an empty day, not null intake', async () => {
    const repo = createTodayRepository(
      backend({
        fetchCurrentTargets: async () => ({
          data: [
            { calories: 2100, effective_from: '2026-07-01', protein_g: 145 },
          ],
          error: null,
        }),
      }),
    );
    const result = await repo.load(TODAY);
    if (result.status !== 'ready') {
      throw new Error('expected ready');
    }
    if (result.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(result.data.nutrition.caloriesProgress).toEqual({
      consumed: 0,
      percent: 0,
      remaining: 2100,
      target: 2100,
    });
  });

  // A fixed set of nutrition logs the backend "filters" by the intake window the
  // repository passes, exactly as the DB would with .gte/.lte on logged_at. Proves the
  // Today intake sum uses the user's local calendar day, not a raw UTC day.
  const nutritionWindowBackend = (
    logs: { logged_at: string; calories: number; protein_g: number }[],
  ) =>
    backend({
      fetchCurrentTargets: async () => ({
        data: [
          { calories: 2100, effective_from: '2026-07-01', protein_g: 145 },
        ],
        error: null,
      }),
      fetchDayNutrition: async (startIso: string, endIso: string) => ({
        data: logs
          .filter((log) => log.logged_at >= startIso && log.logged_at <= endIso)
          .map((log) => ({ calories: log.calories, protein_g: log.protein_g })),
        error: null,
      }),
    });

  it('sums a just-after-local-midnight log into today in BST (UTC+1)', async () => {
    // 00:30 local on 2026-07-15 in UTC+1 is 2026-07-14T23:30:00Z — lost by the old
    // raw-UTC window. It must count towards today's intake, not yesterday's.
    const repo = createTodayRepository(
      nutritionWindowBackend([
        { calories: 600, logged_at: '2026-07-14T23:30:00.000Z', protein_g: 40 },
      ]),
    );

    const result = await repo.load(TODAY, -60);
    if (result.status !== 'ready') throw new Error('expected ready');
    if (result.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(result.data.nutrition.caloriesProgress?.consumed).toBe(600);
  });

  it('excludes a late-evening local log from the next day in BST', async () => {
    // 23:30 local on 2026-07-15 in UTC+1 is 2026-07-15T22:30:00Z: it belongs to the
    // 15th and must not leak into the 16th's intake.
    const repo = createTodayRepository(
      nutritionWindowBackend([
        { calories: 700, logged_at: '2026-07-15T22:30:00.000Z', protein_g: 50 },
      ]),
    );

    const onThe15th = await repo.load('2026-07-15', -60);
    if (onThe15th.status !== 'ready') throw new Error('expected ready');
    if (onThe15th.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(onThe15th.data.nutrition.caloriesProgress?.consumed).toBe(700);

    const onThe16th = await repo.load('2026-07-16', -60);
    if (onThe16th.status !== 'ready') throw new Error('expected ready');
    if (onThe16th.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(onThe16th.data.nutrition.caloriesProgress?.consumed).toBe(0);
  });

  it('assigns a log at exactly local midnight to the new day in BST', async () => {
    // Local midnight 2026-07-15 in UTC+1 is 2026-07-14T23:00:00Z: it belongs to the 15th.
    const repo = createTodayRepository(
      nutritionWindowBackend([
        { calories: 250, logged_at: '2026-07-14T23:00:00.000Z', protein_g: 15 },
      ]),
    );

    const result = await repo.load(TODAY, -60);
    if (result.status !== 'ready') throw new Error('expected ready');
    if (result.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(result.data.nutrition.caloriesProgress?.consumed).toBe(250);
  });

  it('is unchanged at a zero UTC offset', async () => {
    // With offset 0 (the default) the intake window is the raw UTC day, as before.
    const repo = createTodayRepository(
      nutritionWindowBackend([
        { calories: 800, logged_at: '2026-07-15T23:30:00.000Z', protein_g: 55 },
      ]),
    );

    const onThe15th = await repo.load('2026-07-15', 0);
    if (onThe15th.status !== 'ready') throw new Error('expected ready');
    if (onThe15th.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(onThe15th.data.nutrition.caloriesProgress?.consumed).toBe(800);

    const onThe16th = await repo.load('2026-07-16', 0);
    if (onThe16th.status !== 'ready') throw new Error('expected ready');
    if (onThe16th.data.nutrition.kind !== 'target') {
      throw new Error('expected a target');
    }
    expect(onThe16th.data.nutrition.caloriesProgress?.consumed).toBe(0);
  });

  it('surfaces an error when the nutrition read fails', async () => {
    const repo = createTodayRepository(
      backend({
        fetchDayNutrition: async () => ({
          data: null,
          error: { message: 'boom' },
        }),
      }),
    );
    expect((await repo.load(TODAY)).status).toBe('error');
  });
});

describe('today repository — start session', () => {
  it('returns the new log id on success', async () => {
    const repo = createTodayRepository(backend({}));
    const result = await repo.startSession({
      scheduledSessionId: 's-wed',
      startedAtIso: '2026-07-15T08:00:00.000Z',
      userId: 'user-1',
    });
    expect(result).toEqual({ logId: 'log-1', success: true });
  });

  it('surfaces a friendly error when the write fails', async () => {
    const repo = createTodayRepository(
      backend({
        startSession: async () => ({ data: null, error: { message: 'boom' } }),
      }),
    );
    const result = await repo.startSession({
      scheduledSessionId: 's-wed',
      startedAtIso: '2026-07-15T08:00:00.000Z',
      userId: 'user-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.blocked).toBe(false);
      expect(result.message).toContain('could not start');
    }
  });

  it('reports a typed block — not a connection error — when readiness is red', async () => {
    // The trusted RPC refuses a red-blocked start (docs/06 §6.5); the backend flags
    // it as blocked. The repository must surface a distinct blocked failure so the
    // UI shows the red result, never an "offline / try again" error.
    const repo = createTodayRepository(
      backend({
        startSession: async () => ({
          blocked: true,
          data: null,
          error: { message: 'readiness-red-block: latest pre-session is red' },
        }),
      }),
    );
    const result = await repo.startSession({
      scheduledSessionId: 's-wed',
      startedAtIso: '2026-07-15T08:00:00.000Z',
      userId: 'user-1',
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.blocked).toBe(true);
    }
  });
});
