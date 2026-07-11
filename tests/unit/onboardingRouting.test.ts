import { describe, expect, it } from '@jest/globals';

import { resolveRootRoute } from '@/features/onboarding/onboardingRouting';

describe('resolveRootRoute', () => {
  it('sends anyone not authenticated to sign-in', () => {
    expect(resolveRootRoute('unauthenticated', 'loading')).toBe(
      '/(auth)/sign-in',
    );
    expect(resolveRootRoute('configuration_error', 'complete')).toBe(
      '/(auth)/sign-in',
    );
  });

  it('waits while onboarding status is resolving', () => {
    expect(resolveRootRoute('authenticated', 'loading')).toBeNull();
  });

  it('routes an authenticated user by onboarding completion', () => {
    expect(resolveRootRoute('authenticated', 'required')).toBe('/(onboarding)');
    expect(resolveRootRoute('authenticated', 'complete')).toBe('/(tabs)/today');
  });
});
