import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScreen, OfflineState, StatusBadge } from '@/components/common';
import type { CardioPlayerCallbacks } from '@/features/cardio/CardioPlayerView';
import { CardioPlayerView } from '@/features/cardio/CardioPlayerView';
import { useCardioPlayer } from '@/features/cardio/useCardioPlayer';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 16, S-014: the cardio interval player. It continues (or opens) the
// in-progress cardio_log for the given scheduled cardio session, plays the seeded
// run-walk stage with audio and haptic cues at each transition, supports pause and
// resume, and writes the cardio_logs summary on completion. Starting a cardio
// session is not gated by the red-readiness block (only running and demanding
// lower-body are), so no trusted RPC is involved — the player owns its own log.
//
// The player keeps working offline: the resume state is saved on the device, and
// only the final summary write needs the network. The offline state replaces the
// player only when the initial load has not happened.
export default function CardioSessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ sessionId: string }>();
  const sessionId =
    typeof params.sessionId === 'string' ? params.sessionId : '';
  const player = useCardioPlayer(sessionId);
  const { isOffline } = useNetworkStatus();

  const callbacks: CardioPlayerCallbacks = {
    onEnd: () => player.end(() => router.back()),
    onExit: () => router.back(),
    onPause: player.pause,
    onResume: player.resume,
    onSetEffort: player.setEffort,
  };

  const showOffline = isOffline && player.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Cardio session" title="Cardio">
      {showOffline ? (
        <OfflineState description="Your session will open here once you are back online. Your progress is safe on this device." />
      ) : (
        <>
          {isOffline ? (
            <StatusBadge
              label="Offline — your session is saved on this device"
              tone="info"
            />
          ) : null}
          <CardioPlayerView callbacks={callbacks} state={player.state} />
        </>
      )}
    </AppScreen>
  );
}
