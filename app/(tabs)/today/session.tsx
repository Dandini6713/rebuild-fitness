import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { AppScreen, OfflineState, StatusBadge } from '@/components/common';
import type { WorkoutPlayerCallbacks } from '@/features/workouts/WorkoutPlayerView';
import { WorkoutPlayerView } from '@/features/workouts/WorkoutPlayerView';
import { useWorkoutPlayer } from '@/features/workouts/useWorkoutPlayer';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 11, S-012: the guided strength workout player. It continues the
// in-progress workout_log for the given scheduled session (created by Today's
// "Start session"), records each set local-first, and finishes the session. The
// player keeps working offline — sets are saved on the device and synced later —
// so the offline state only replaces it when the initial load has not happened.
export default function WorkoutSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId =
    typeof params.sessionId === 'string' ? params.sessionId : '';
  const player = useWorkoutPlayer(sessionId);
  const { isOffline } = useNetworkStatus();

  // Flush any sets saved while offline once the connection returns.
  const wasOffline = useRef(isOffline);
  useEffect(() => {
    if (wasOffline.current && !isOffline) {
      player.retrySync();
    }
    wasOffline.current = isOffline;
  }, [isOffline, player]);

  const callbacks: WorkoutPlayerCallbacks = {
    onAcceptProposal: player.acceptProposal,
    onAdjustReps: player.adjustReps,
    onAdjustWeight: player.adjustWeight,
    onDismissProposal: player.dismissProposal,
    onEnd: () => player.endWorkout(() => router.back()),
    onExit: () => router.back(),
    onLogSet: player.logSet,
    onNextExercise: player.goToNextExercise,
    onOpenGuide: (slug) => router.push(`/today/exercise/${slug}`),
    onPreviousExercise: player.goToPreviousExercise,
    onSetDiscomfort: player.setDiscomfort,
    onSetEffort: player.setEffort,
    onSetTechniqueControlled: player.setTechniqueControlled,
    onSkipRest: player.skipRest,
  };

  const showOffline = isOffline && player.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Strength session" title="Workout">
      {showOffline ? (
        <OfflineState description="Your session will open here once you are back online. Any sets you have already recorded are safe on this device." />
      ) : (
        <>
          {isOffline ? (
            <StatusBadge
              label="Offline — sets are saved on this device"
              tone="info"
            />
          ) : null}
          <WorkoutPlayerView callbacks={callbacks} state={player.state} />
        </>
      )}
    </AppScreen>
  );
}
