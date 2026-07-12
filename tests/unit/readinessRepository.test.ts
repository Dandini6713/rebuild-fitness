import { describe, expect, it, jest } from '@jest/globals';

import {
  createReadinessRepository,
  type ReadinessBackend,
  type ReadinessSubmission,
} from '@/features/readiness/readinessRepository';

const rawAnswers = (
  overrides: Partial<ReadinessSubmission> = {},
): ReadinessSubmission => ({
  cannotBearWeight: false,
  checkinType: 'pre_session',
  confidenceScore: 5,
  notes: null,
  painScore: 1,
  previousNextMorningIncrease: false,
  scheduledSessionId: null,
  sessionEffort: null,
  stiffnessChange: 'same',
  suddenChange: false,
  swellingLevel: 'none',
  walkingStatus: 'normal',
  ...overrides,
});

describe('readiness repository — the trusted write path', () => {
  it('submits only raw answers and never a classification', async () => {
    const submit = jest.fn<ReadinessBackend['submit']>(async () => ({
      data: {
        classification: 'green',
        id: 'chk-1',
        reasons: [{ code: 'all-clear', message: 'ok' }],
        ruleVersion: 'readiness/v1',
      },
      error: null,
    }));
    const repo = createReadinessRepository({ submit });

    await repo.submit(rawAnswers({ painScore: 8 }));

    expect(submit).toHaveBeenCalledTimes(1);
    const passed = submit.mock.calls[0]?.[0] as Record<string, unknown>;
    // The submission the client hands the backend carries the raw answers...
    expect(passed.painScore).toBe(8);
    expect(passed.checkinType).toBe('pre_session');
    // ...and crucially no classification of any name.
    expect(passed).not.toHaveProperty('classification');
    expect(Object.keys(passed)).not.toContain('classification');
  });

  it('returns the server-computed classification, not a client-chosen one', async () => {
    // Even though the answers look red locally, the client trusts the server's
    // returned classification verbatim.
    const repo = createReadinessRepository({
      submit: async () => ({
        data: {
          classification: 'red',
          id: 'chk-2',
          reasons: [{ code: 'high-pain', message: 'high pain' }],
          ruleVersion: 'readiness/v1',
        },
        error: null,
      }),
    });
    const result = await repo.submit(rawAnswers({ painScore: 8 }));
    expect(result.status).toBe('classified');
    if (result.status !== 'classified') {
      return;
    }
    expect(result.result.classification).toBe('red');
    expect(result.result.ruleVersion).toBe('readiness/v1');
  });

  it('holds the answers with a provisional result when the request looks offline', async () => {
    const repo = createReadinessRepository({
      submit: async () => ({
        data: null,
        error: { message: 'Network request failed' },
      }),
    });
    // Red answers offline: the provisional (same-rules) result must still surface red.
    const result = await repo.submit(rawAnswers({ suddenChange: true }));
    expect(result.status).toBe('held');
    if (result.status !== 'held') {
      return;
    }
    expect(result.provisional.classifiable).toBe(true);
    expect(result.provisional.classification).toBe('red');
  });

  it('surfaces a non-network failure as an error, not a hold', async () => {
    const repo = createReadinessRepository({
      submit: async () => ({
        data: null,
        error: { message: 'permission denied' },
      }),
    });
    const result = await repo.submit(rawAnswers());
    expect(result.status).toBe('error');
  });
});
