import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { TodayView } from '@/features/today/TodayView';
import { useToday } from '@/features/today/useToday';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 08: Today, driven by the signed-in user's own rows — today's scheduled
// session, the current nutrition target and this week's workout logs (all
// owner-scoped under RLS). Domain calculations live in domain/training and
// domain/nutrition; the read model and states live in features/today.
//
// Roadmap 11: the dominant "Start session" now records that the session has begun
// (creating the workout_log) and opens the guided strength player on that same
// row; an already in-progress session offers "Continue session", which reopens the
// player without creating a second log.
//
// Roadmap 14: "Start session" now goes through the trusted start_scheduled_session
// RPC. A red pre-session readiness result blocks a running or demanding-lower-body
// start server-side; the block surfaces here as startBlockedByReadiness and TodayView
// shows the honest red result. Passing through the standalone "Readiness check" is how
// the user records the check the block reads.
export default function TodayScreen() {
  const router = useRouter();
  const {
    greeting,
    reload,
    startBlockedByReadiness,
    startError,
    startSession,
    starting,
    state,
    todayIso,
  } = useToday();
  const { isOffline } = useNetworkStatus();

  const openPlayer = useCallback(
    (scheduledSessionId: string) => {
      router.push(`/today/session?sessionId=${scheduledSessionId}`);
    },
    [router],
  );

  // Reload when returning to Today (for example after finishing a session in the
  // player) so a completed session shows as completed.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // While offline we can't load today from Supabase. Once cached reads land (a
  // later roadmap step) an already-loaded day would stay visible; until then, an
  // offline connection with nothing loaded shows the offline state.
  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Your day" title="Today">
      {showOffline ? (
        <OfflineState description="Today's session and progress will appear here once you are back online." />
      ) : (
        <>
          <TodayView
            greeting={greeting}
            onOpenPlayer={openPlayer}
            onStart={(scheduledSessionId) =>
              startSession(scheduledSessionId, openPlayer)
            }
            startBlocked={startBlockedByReadiness}
            startError={startError}
            starting={starting}
            state={state}
            todayIso={todayIso}
          />
          {/*
            The standalone entry to the readiness check (S-011). Recording a
            pre-session check here is how the user updates the classification the
            server reads when they next start the session; a red result then blocks
            that start (roadmap 14).
          */}
          <SecondaryButton
            label="Readiness check"
            onPress={() => router.push('/today/readiness?type=pre_session')}
          />
        </>
      )}
    </AppScreen>
  );
}
