import { AppScreen, OfflineState } from '@/components/common';
import { WeeklyPlanView } from '@/features/plan/WeeklyPlanView';
import { useWeeklyPlan } from '@/features/plan/useWeeklyPlan';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// The Plan tab is the weekly planner (roadmap 09, S-020): seven day cards with
// per-session move, replace and skip actions, on the seeded schedule. The S-021
// monthly calendar overview is a deliberate seam — the detailed scheduling lives
// here in the weekly plan, and a month view adds little on top of the same read
// model, so it is left for a later step rather than built thin now.
export default function PlanScreen() {
  const planner = useWeeklyPlan();
  const { isOffline } = useNetworkStatus();

  // While offline we can't load the week from Supabase. Once cached plans land
  // (a later roadmap step) an already-loaded week would stay visible; until then,
  // an offline connection with nothing loaded shows the offline state.
  const showOffline = isOffline && planner.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Plan ahead" title="Weekly Planner">
      {showOffline ? (
        <OfflineState description="Your week will load here once you are back online." />
      ) : (
        <WeeklyPlanView planner={planner} />
      )}
    </AppScreen>
  );
}
