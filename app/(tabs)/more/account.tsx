import { useRouter } from 'expo-router';
import { Share } from 'react-native';

import { AppScreen, SecondaryButton } from '@/components/common';
import { AccountDataView } from '@/features/account/AccountDataView';
import {
  useAccountDeletion,
  useAccountExport,
} from '@/features/account/useAccountData';

// Roadmap 25: the Data export and account deletion screen (S-053), reached from the More tab.
// The hooks own the export assembly and the re-authentication-gated deletion; this screen
// wires the view to them and provides the minimal share mechanism.
//
// SHARE MECHANISM (declared minimal, per the brief). The prepared export is shared via React
// Native's built-in Share API rather than written to a file — no new dependency is pulled in
// for a surface whose real proof is a device pass (the same no-casual-dependency stance as the
// roadmap-21 dashboard). A file-based export (expo-file-system + expo-sharing) is the
// sanctioned next step if the data outgrows this; the DATA correctness (the versioned,
// complete JSON) is what matters here and is fully unit-tested.
export default function AccountScreen() {
  const router = useRouter();
  const { exportState, generate } = useAccountExport();
  const { cancel, confirm, deletionState, start } = useAccountDeletion();

  return (
    <AppScreen eyebrow="Privacy" title="Your data">
      <SecondaryButton
        accessibilityHint="Returns to the More tab."
        label="Back"
        onPress={() => router.back()}
      />
      <AccountDataView
        deletionState={deletionState}
        exportState={exportState}
        onCancelDeletion={cancel}
        onConfirmDeletion={confirm}
        onGenerateExport={generate}
        onShareExport={(json, filename) => {
          void Share.share({ message: json, title: filename });
        }}
        onStartDeletion={start}
      />
    </AppScreen>
  );
}
