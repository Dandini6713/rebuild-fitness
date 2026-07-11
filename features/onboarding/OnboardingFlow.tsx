import { Redirect } from 'expo-router';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import { useOnboarding } from './OnboardingProvider';
import { type OnboardingStepId } from './onboardingSteps';
import { AchillesStep } from './steps/AchillesStep';
import { AvailabilityStep } from './steps/AvailabilityStep';
import { ConfirmationStep } from './steps/ConfirmationStep';
import { GoalsStep } from './steps/GoalsStep';
import { WelcomeStep } from './steps/WelcomeStep';

export function OnboardingLoadingScreen() {
  const { colours, spacing } = useAppTheme();
  return (
    <View
      accessibilityLabel="Preparing your setup"
      accessibilityRole="progressbar"
      style={{
        alignItems: 'center',
        backgroundColor: colours.background,
        flex: 1,
        gap: spacing.md,
        justifyContent: 'center',
        padding: spacing.lg,
      }}
    >
      <ActivityIndicator color={colours.accent} size="large" />
      <AppText tone="secondary">Preparing your setup…</AppText>
    </View>
  );
}

function renderStep(step: OnboardingStepId) {
  switch (step) {
    case 'welcome':
      return <WelcomeStep />;
    case 'goals':
      return <GoalsStep />;
    case 'availability':
      return <AvailabilityStep />;
    case 'achilles':
      return <AchillesStep />;
    case 'confirm':
      return <ConfirmationStep />;
  }
}

export function OnboardingFlow() {
  const { currentStep, status } = useOnboarding();

  if (status === 'loading') {
    return <OnboardingLoadingScreen />;
  }

  if (status === 'complete') {
    return <Redirect href="/(tabs)/today" />;
  }

  return renderStep(currentStep);
}
