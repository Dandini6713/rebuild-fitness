import type { AuthStatus } from '@/features/auth/authRouting';

import type { OnboardingFlowStatus } from './OnboardingProvider';

export type RootRoute = '/(auth)/sign-in' | '/(onboarding)' | '/(tabs)/today';

// Decides where an app-launch should land. Onboarding sits between a
// successful sign-in and the main tabs: an authenticated beta user who has not
// finished onboarding is sent to the flow, everyone else to the tabs. Returns
// null while onboarding status is still resolving (show a loading screen).
export function resolveRootRoute(
  auth: AuthStatus,
  onboarding: OnboardingFlowStatus,
): RootRoute | null {
  if (auth !== 'authenticated') {
    return '/(auth)/sign-in';
  }
  if (onboarding === 'loading') {
    return null;
  }
  return onboarding === 'complete' ? '/(tabs)/today' : '/(onboarding)';
}
