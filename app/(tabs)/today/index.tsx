import { AppScreen, OfflineState } from '@/components/common';
import { TodayView } from '@/features/today/TodayView';
import { useToday } from '@/features/today/useToday';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 08: Today, driven by the signed-in user's own rows — today's scheduled
// session, the current nutrition target and this week's workout logs (all
// owner-scoped under RLS). Domain calculations live in domain/training and
// domain/nutrition; the read model and states live in features/today. The guided
// session player (docs/03 S-012) is a later roadmap item; the primary action here
// records that a session has begun and the screen reflects the in-progress state.
export default function TodayScreen() {
  const { greeting, startError, startSession, starting, state, todayIso } =
    useToday();
  const { isOffline } = useNetworkStatus();

  // While offline we can't load today from Supabase. Once cached reads land (a
  // later roadmap step) an already-loaded day would stay visible; until then, an
  // offline connection with nothing loaded shows the offline state.
  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Your day" title="Today">
      {showOffline ? (
        <OfflineState description="Today's session and progress will appear here once you are back online." />
      ) : (
        <TodayView
          greeting={greeting}
          onStart={startSession}
          startError={startError}
          starting={starting}
          state={state}
          todayIso={todayIso}
        />
      )}
    </AppScreen>
  );
}
