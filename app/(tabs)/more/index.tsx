import {
  AppScreen,
  Card,
  SectionHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { SupabaseConnectionStatus } from '@/features/diagnostics/SupabaseConnectionStatus';

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
      <SectionHeader
        description="No credentials or private health information are shown here."
        title="Developer diagnostics"
      />
      <SupabaseConnectionStatus />
    </AppScreen>
  );
}
