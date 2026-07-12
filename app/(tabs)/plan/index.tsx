import { AppScreen, OfflineState } from '@/components/common';
import { PlanPreviewView } from '@/features/plan/PlanPreviewView';
import { usePlanPreview } from '@/features/plan/usePlanPreview';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

export default function PlanScreen() {
  const state = usePlanPreview();
  const { isOffline } = useNetworkStatus();

  // While offline we can't load the plan from Supabase. Once cached plans land
  // (a later roadmap step) an already-loaded plan would stay visible; until
  // then, an offline connection with nothing loaded shows the offline state.
  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Plan ahead" title="Weekly Planner">
      {showOffline ? (
        <OfflineState description="Your plan will load here once you are back online." />
      ) : (
        <PlanPreviewView state={state} />
      )}
    </AppScreen>
  );
}
