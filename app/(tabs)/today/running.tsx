import { useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { RunningProgressionView } from '@/features/running/RunningProgressionView';
import { useRunningProgression } from '@/features/running/useRunningProgression';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 17, docs/06 §6.3: the running progression surface. On demand it evaluates
// the user's current run-walk stage from their completed cardio sessions and readiness
// responses, and proposes advancing / repeating / regressing / pausing the stage. The
// rules are the pure engine (domain/training/runningProgression.ts); it only PROPOSES.
// Advancing needs the user's explicit confirmation — the "Confirm and advance" action
// here — and even then only records the decision; applying an accepted advance to the
// forward schedule is a declared seam (the base plan does not yet link a scheduled
// cardio session to a stage).
//
// A red or altered-walking readiness response eases the stage back rather than
// progressing; a soft same-week volume note (docs/06 §6.5) is shown alongside an
// advance when an accepted lower-body strength increase lands in the same week, but it
// never blocks. Nothing here diagnoses or assesses anything (docs/07).
export default function RunningProgressionScreen() {
  const router = useRouter();
  const running = useRunningProgression();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && running.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Running" title="Running progression">
      {showOffline ? (
        <OfflineState description="Your running progression will appear here once you are back online." />
      ) : (
        <>
          <RunningProgressionView
            callbacks={{
              onAccept: running.accept,
              onDismiss: running.dismiss,
              onDone: () => router.back(),
            }}
            state={running.state}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
