import { AppScreen, EmptyState, OfflineState } from '@/components/common';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Shell for roadmap 07. Weight, waist, session and adherence trends (later
// roadmap steps) will replace this empty state with real charts. Nothing is
// shown yet because there is no logged history to draw, and docs/09 §9.6 asks us
// to explain missing data rather than invent it.
export default function ProgressScreen() {
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Trends, not judgement" title="Progress">
      {isOffline ? (
        <OfflineState description="Your trends will appear here once you are back online." />
      ) : (
        <EmptyState
          description="Your weight and waist trends, sessions completed and other progress will appear here once there is enough logged to show them honestly."
          title="Not enough logged yet"
        />
      )}
    </AppScreen>
  );
}
