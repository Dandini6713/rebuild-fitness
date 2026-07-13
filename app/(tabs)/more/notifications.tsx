import { useRouter } from 'expo-router';
import { Linking } from 'react-native';

import { AppScreen, SecondaryButton } from '@/components/common';
import { NotificationSettingsView } from '@/features/notifications/NotificationSettingsView';
import { useNotificationSettings } from '@/features/notifications/useNotificationSettings';

// Roadmap 24: the Notifications settings screen (S-051), reached from the More tab. Per-type
// reminder toggles, the honest OS permission state, and rescheduling on change/open. The
// hook owns the preferences, permission and scheduling; this screen wires the view to it and
// provides the route into the OS settings when permission is denied.
export default function NotificationsScreen() {
  const router = useRouter();
  const {
    loadState,
    permission,
    refresh,
    requestPermission,
    saveState,
    setPreference,
  } = useNotificationSettings();

  return (
    <AppScreen eyebrow="Settings" title="Notifications">
      <SecondaryButton
        accessibilityHint="Returns to the More tab."
        label="Back"
        onPress={() => router.back()}
      />
      <NotificationSettingsView
        loadState={loadState}
        onOpenSystemSettings={() => void Linking.openSettings()}
        onRefresh={refresh}
        onRequestPermission={requestPermission}
        onToggle={setPreference}
        permission={permission}
        saveState={saveState}
      />
    </AppScreen>
  );
}
