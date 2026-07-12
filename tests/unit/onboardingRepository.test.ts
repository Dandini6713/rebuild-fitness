import { describe, expect, it, jest } from '@jest/globals';

import {
  createOnboardingRepository,
  type OnboardingBackend,
} from '@/features/onboarding/onboardingRepository';

const submitInput = {
  achilles: {
    calfRaiseCapability: 'comfortable' as const,
    painStiffness: 'none' as const,
    previousInjuryAcknowledged: true,
    professionalRestrictions: '',
    walkingTolerance: 'unrestricted' as const,
  },
  completedAt: '2026-07-11T09:00:00.000Z',
  goals: {
    currentWeightKg: 90,
    heightCm: 183,
    mainObjective: 'lose_fat' as const,
    preferredRate: 'steady' as const,
    targetWeightKg: 84,
    waistCm: 96,
  },
  userId: 'user-1',
};

function backend(overrides: Partial<OnboardingBackend>): OnboardingBackend {
  return {
    getCompletedAt: jest.fn(async () => ({ data: null, error: null })),
    persist: jest.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe('onboarding repository', () => {
  it('treats a stored completion time as completed', async () => {
    const repo = createOnboardingRepository(
      backend({
        getCompletedAt: async () => ({ data: 'a-time', error: null }),
      }),
    );
    await expect(repo.fetchStatus('user-1')).resolves.toEqual({
      completed: true,
      success: true,
    });
  });

  it('treats a null completion time as not completed', async () => {
    const repo = createOnboardingRepository(backend({}));
    await expect(repo.fetchStatus('user-1')).resolves.toEqual({
      completed: false,
      success: true,
    });
  });

  it('reports a failure when the status check errors', async () => {
    const repo = createOnboardingRepository(
      backend({
        getCompletedAt: async () => ({
          data: null,
          error: { message: 'boom' },
        }),
      }),
    );
    const result = await repo.fetchStatus('user-1');
    expect(result.success).toBe(false);
  });

  it('persists the built submission on submit', async () => {
    const persist = jest.fn<OnboardingBackend['persist']>(async () => ({
      error: null,
    }));
    const repo = createOnboardingRepository(backend({ persist }));
    const result = await repo.submit(submitInput);

    expect(result.success).toBe(true);
    expect(persist).toHaveBeenCalledTimes(1);
    const submission = persist.mock.calls[0]?.[0];
    expect(submission?.profile.onboarding_completed_at).toBe(
      '2026-07-11T09:00:00.000Z',
    );
  });

  it('surfaces a friendly error when persistence fails', async () => {
    const repo = createOnboardingRepository(
      backend({ persist: async () => ({ error: { message: 'nope' } }) }),
    );
    const result = await repo.submit(submitInput);
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.message).toContain('could not save');
    }
  });
});
