import { useState } from 'react';

import {
  AppScreen,
  AppText,
  Card,
  SectionHeader,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { useAuth } from '@/features/auth/AuthProvider';
import { SupabaseConnectionStatus } from '@/features/diagnostics/SupabaseConnectionStatus';

export default function SettingsScreen() {
  const { signOut } = useAuth();
  const [signOutError, setSignOutError] = useState<string | null>(null);
  const [isSigningOut, setIsSigningOut] = useState(false);

  async function handleSignOut() {
    setSignOutError(null);
    setIsSigningOut(true);
    const result = await signOut();
    if (!result.success) {
      setSignOutError(result.message);
      setIsSigningOut(false);
    }
  }

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
        {signOutError ? (
          <AppText accessibilityLiveRegion="assertive">{signOutError}</AppText>
        ) : null}
        <SecondaryButton
          label="Sign out"
          loading={isSigningOut}
          onPress={handleSignOut}
        />
      </Card>
      <SectionHeader
        description="No credentials or private health information are shown here."
        title="Developer diagnostics"
      />
      <SupabaseConnectionStatus />
    </AppScreen>
  );
}
