import { useState } from 'react';
import { View } from 'react-native';

import { AppText, Card, EmptyState, StatusBadge } from '@/components/common';
import { useAppTheme } from '@/theme/useAppTheme';

import { useOnboarding } from '../OnboardingProvider';
import { OnboardingStepScaffold } from '../OnboardingStepScaffold';
import {
  deriveAchillesCaution,
  deriveWeightPlan,
  describeObjective,
} from '../onboardingDerivations';

function SummaryRow({ label, value }: { label: string; value: string }) {
  const { spacing } = useAppTheme();
  return (
    <View style={{ gap: spacing.xxs }}>
      <AppText tone="tertiary" variant="caption">
        {label}
      </AppText>
      <AppText>{value}</AppText>
    </View>
  );
}

export function ConfirmationStep() {
  const { draft, goBack, submit, submitting } = useOnboarding();
  const [error, setError] = useState<string | null>(null);

  // Defensive: resolveResumeStep clamps to the first incomplete step, so we
  // should always have the data here. If not, guide the user back rather than
  // submitting a partial profile.
  if (!draft.goals || !draft.achilles) {
    return (
      <OnboardingStepScaffold
        step="confirm"
        title="Plan confirmation"
        primaryLabel="Go back"
        onPrimary={goBack}
      >
        <EmptyState
          title="A few answers are missing"
          description="Please complete the earlier steps, then return here to confirm."
        />
      </OnboardingStepScaffold>
    );
  }

  const weightPlan = deriveWeightPlan(draft.goals);
  const caution = deriveAchillesCaution(draft.achilles);

  async function onConfirm() {
    setError(null);
    const result = await submit();
    if (!result.success) {
      setError(result.message);
    }
  }

  return (
    <OnboardingStepScaffold
      step="confirm"
      title="Plan confirmation"
      intro="Please check your answers. You can go back to change anything."
      primaryLabel="Confirm and continue"
      onPrimary={onConfirm}
      onBack={goBack}
      primaryLoading={submitting}
      error={error}
    >
      <Card>
        <AppText variant="label">Your goals</AppText>
        <SummaryRow
          label="Main objective"
          value={describeObjective(draft.goals)}
        />
        <SummaryRow label="Weight plan" value={weightPlan.summary} />
      </Card>

      <Card>
        <AppText variant="label">Getting started safely</AppText>
        {caution.conservativeStart ? (
          <>
            <StatusBadge label="Cautious start" tone="caution" />
            <AppText tone="secondary">
              Based on what you told us, the app will begin with more cautious
              general fitness options.
            </AppText>
            {caution.reasons.map((reason) => (
              <AppText key={reason} tone="secondary" variant="caption">
                • {reason}
              </AppText>
            ))}
          </>
        ) : (
          <AppText tone="secondary">
            The app will start you on the standard beginner-friendly options and
            progress gradually.
          </AppText>
        )}
        <AppText tone="tertiary" variant="caption">
          This does not assess whether the tendon is healed. If anything
          concerns you, please speak to a suitable healthcare professional.
        </AppText>
      </Card>

      <Card>
        <StatusBadge label="Being prepared" tone="info" />
        <AppText variant="heading">Your plan is on its way</AppText>
        <AppText tone="secondary">
          Once you confirm, Rebuild will prepare your twelve-week plan. The
          first four weeks and a summary of later progression will appear on
          your Today screen when they are ready.
        </AppText>
      </Card>
    </OnboardingStepScaffold>
  );
}
