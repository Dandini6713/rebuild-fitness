import { describe, expect, it, jest } from '@jest/globals';

import {
  createSubstitutionRepository,
  type SubstitutionBackend,
  type SubstitutionRequest,
} from '@/features/readiness/substitutionRepository';

const request = (
  overrides: Partial<SubstitutionRequest> = {},
): SubstitutionRequest => ({
  expectNextMorningCheck: true,
  newTemplateId: null,
  newType: 'cardio',
  originalSessionId: 'session-1',
  reason: 'Amber readiness result — replaced with easy cycling.',
  ...overrides,
});

describe('substitution repository — the atomic amber swap', () => {
  it('passes the request through and returns the new replacement id', async () => {
    const substitute = jest.fn<SubstitutionBackend['substitute']>(async () => ({
      data: 'new-session-9',
      error: null,
    }));
    const repo = createSubstitutionRepository({ substitute });

    const result = await repo.substitute(request());

    expect(substitute).toHaveBeenCalledTimes(1);
    expect(substitute.mock.calls[0]?.[0]).toEqual(request());
    expect(result).toEqual({
      newSessionId: 'new-session-9',
      status: 'substituted',
    });
  });

  it('fails honestly as offline on a network-shaped error, not a pretend success', async () => {
    const repo = createSubstitutionRepository({
      substitute: async () => ({
        data: null,
        error: { message: 'Network request failed' },
      }),
    });
    const result = await repo.substitute(request());
    expect(result).toEqual({ status: 'offline' });
  });

  it('surfaces a non-network failure as an error', async () => {
    const repo = createSubstitutionRepository({
      substitute: async () => ({
        data: null,
        error: { message: 'only a planned session can be substituted' },
      }),
    });
    const result = await repo.substitute(request());
    expect(result.status).toBe('error');
    if (result.status !== 'error') {
      return;
    }
    expect(result.message).toContain('planned session');
  });

  it('treats a missing returned id as an error rather than a silent success', async () => {
    const repo = createSubstitutionRepository({
      substitute: async () => ({ data: null, error: null }),
    });
    const result = await repo.substitute(request());
    expect(result.status).toBe('error');
  });
});
