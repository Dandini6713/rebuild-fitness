import {
  AppScreen,
  AppText,
  Card,
  PrimaryButton,
  ProgressBar,
  SectionHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';

export default function TodayScreen() {
  return (
    <AppScreen eyebrow="Monday, 13 July" title="Today">
      <SectionHeader
        description="A calm preview of the shared components."
        title="Your next step"
      />
      <Card>
        <StatusBadge label="Example session" tone="info" />
        <AppText variant="heading">Strength A</AppText>
        <AppText tone="secondary">About 40 minutes · Gym equipment</AppText>
        <PrimaryButton disabled label="Start session" />
        <SecondaryButton disabled label="View options" />
      </Card>
      <Card>
        <SectionHeader
          description="3 of 5 example sessions"
          title="This week"
        />
        <ProgressBar accessibilityLabel="Example weekly progress" value={60} />
      </Card>
    </AppScreen>
  );
}
