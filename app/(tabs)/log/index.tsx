import { AppScreen, EmptyState, OfflineState } from '@/components/common';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Shell for roadmap 07. The food, alcohol, weight and waist logging forms
// (roadmap 08 onward) will replace this empty state with the log hub and recent
// entries. No controls are shown yet because none of them would save anything.
export default function LogScreen() {
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Keep it honest, keep it useful" title="Log">
      {isOffline ? (
        <OfflineState description="You will be able to record food, drinks, weight and waist here once you are back online." />
      ) : (
        <EmptyState
          description="This is where you'll record food, lager or alcohol, weight and waist, and see your recent entries. Logging opens up as the app is built out."
          title="Logging isn't ready yet"
        />
      )}
    </AppScreen>
  );
}
