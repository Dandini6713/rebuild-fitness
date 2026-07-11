import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';
import { OnboardingLoadingScreen } from '@/features/onboarding/OnboardingFlow';
import { useOnboarding } from '@/features/onboarding/OnboardingProvider';
import { resolveRootRoute } from '@/features/onboarding/onboardingRouting';

export default function IndexScreen() {
  const { status: authStatus } = useAuth();
  const { status: onboardingStatus } = useOnboarding();

  const route = resolveRootRoute(authStatus, onboardingStatus);
  if (!route) {
    return <OnboardingLoadingScreen />;
  }

  return <Redirect href={route} />;
}
