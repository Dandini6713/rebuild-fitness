import { PropsWithChildren } from 'react';
import { View } from 'react-native';

import {
  AppScreen,
  AppText,
  PrimaryButton,
  ProgressBar,
  SecondaryButton,
} from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import {
  type OnboardingStepId,
  stepCount,
  stepNumber,
  stepProgress,
} from './onboardingSteps';

type OnboardingStepScaffoldProps = PropsWithChildren<{
  error?: string | null;
  intro?: string;
  onBack?: (() => void) | undefined;
  onPrimary(): void;
  primaryDisabled?: boolean;
  primaryLabel: string;
  primaryLoading?: boolean;
  step: OnboardingStepId;
  title: string;
}>;

export function OnboardingStepScaffold({
  children,
  error,
  intro,
  onBack,
  onPrimary,
  primaryDisabled,
  primaryLabel,
  primaryLoading,
  step,
  title,
}: OnboardingStepScaffoldProps) {
  const { colours, spacing } = useAppTheme();

  return (
    <AppScreen
      eyebrow={`Step ${stepNumber(step)} of ${stepCount}`}
      title={title}
      footer={
        <View
          style={{
            borderTopColor: colours.borderSubtle,
            borderTopWidth: 1,
            gap: spacing.sm,
            padding: spacing.lg,
          }}
        >
          {error ? (
            <AppText
              accessibilityLiveRegion="assertive"
              style={{ color: colours.dangerText }}
            >
              {error}
            </AppText>
          ) : null}
          <PrimaryButton
            disabled={primaryDisabled ?? false}
            label={primaryLabel}
            loading={primaryLoading ?? false}
            onPress={onPrimary}
          />
          {onBack ? <SecondaryButton label="Back" onPress={onBack} /> : null}
        </View>
      }
    >
      <ProgressBar
        accessibilityLabel={`Onboarding progress: step ${stepNumber(
          step,
        )} of ${stepCount}`}
        value={stepProgress(step)}
      />
      {intro ? <AppText tone="secondary">{intro}</AppText> : null}
      {children}
    </AppScreen>
  );
}
