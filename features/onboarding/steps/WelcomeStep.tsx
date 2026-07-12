import { AppText, Card, StatusBadge } from '@/components/common';

import { OnboardingStepScaffold } from '../OnboardingStepScaffold';
import { useOnboarding } from '../OnboardingProvider';

// S-001 Welcome. This runs AFTER sign-in: the private beta uses pre-created
// accounts and has no public registration (see docs/01 FR-001 and the auth
// feature), so the "create account" action in the S-001 spec does not apply.
// This screen therefore welcomes an already-authenticated beta user and begins
// setup. No health data is requested here (S-001 acceptance criteria).
export function WelcomeStep() {
  const { goTo } = useOnboarding();

  return (
    <OnboardingStepScaffold
      step="welcome"
      title="Welcome to Rebuild"
      primaryLabel="Begin setup"
      onPrimary={() => goTo('goals')}
    >
      <Card>
        <StatusBadge label="Private beta" tone="info" />
        <AppText variant="heading">
          Your training, food and recovery plan in one place.
        </AppText>
        <AppText tone="secondary">
          You are signed in, so let us set up your plan. This takes a few short
          steps. You can leave at any point and pick up where you left off.
        </AppText>
      </Card>
      <Card>
        <AppText variant="label">Before we start</AppText>
        <AppText tone="secondary">
          Rebuild is a general fitness and wellness app. It does not diagnose,
          treat or rehabilitate injury, and it does not replace advice from a GP
          or physiotherapist. You can read the privacy and wellness notes at any
          time from the More tab.
        </AppText>
      </Card>
    </OnboardingStepScaffold>
  );
}
