import {
  AppScreen,
  AppText,
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';

export default function OnboardingScreen() {
  return (
    <AppScreen
      eyebrow="Welcome to Rebuild"
      title="A steady plan for everyday fitness"
    >
      <Card>
        <StatusBadge label="Design preview" tone="info" />
        <AppText variant="heading">
          Your training, food and recovery plan in one place.
        </AppText>
        <AppText tone="secondary">
          Secure account setup will be added later. This preview does not
          collect health information.
        </AppText>
      </Card>
      <PrimaryButton disabled label="Create account" />
      <SecondaryButton disabled label="Sign in" />
    </AppScreen>
  );
}
