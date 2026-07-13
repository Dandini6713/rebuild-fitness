import { useRouter } from 'expo-router';
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
  const router = useRouter();
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
        description="Profile and privacy settings open up as the app is built out. Notifications and signing out already work."
        title="Rebuild"
      />
      <SectionHeader
        description="Plain-English guides to every exercise in your strength sessions: how to set up, move, breathe and stay safe."
        title="Learn"
      />
      <Card>
        <SecondaryButton
          accessibilityHint="Opens the exercise guide."
          label="Exercise guide"
          onPress={() => router.push('/more/exercises')}
        />
      </Card>
      <Card>
        <StatusBadge label="Private beta" tone="info" />
        <SecondaryButton disabled label="Profile and goals" />
        <SecondaryButton
          accessibilityHint="Opens your notification settings."
          label="Notifications"
          onPress={() => router.push('/more/notifications')}
        />
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
