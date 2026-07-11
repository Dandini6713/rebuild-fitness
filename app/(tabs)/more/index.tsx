import {
  AppScreen,
  Card,
  SectionHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';

export default function SettingsScreen() {
  return (
    <AppScreen eyebrow="Your preferences" title="Settings">
      <SectionHeader
        description="Settings remain local placeholders in this design preview."
        title="Rebuild"
      />
      <Card>
        <StatusBadge label="Private beta" tone="info" />
        <SecondaryButton disabled label="Profile and goals" />
        <SecondaryButton disabled label="Notifications" />
        <SecondaryButton disabled label="Privacy and help" />
      </Card>
    </AppScreen>
  );
}
