import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback } from 'react';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { ProgressDashboardView } from '@/features/progress/ProgressDashboardView';
import { useProgressDashboard } from '@/features/progress/useProgressDashboard';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 21: the progress dashboard (docs/03 S-040, docs/09 §9.6). A READ-ONLY display
// over data other roadmaps produce — weight and waist trends, session adherence,
// strength, cardio, protein and alcohol — in a 4-week or 12-week view. It computes no new
// rules and proposes nothing; the weekly review (roadmap 22) is a separate screen that
// reuses these calculations. Sparse data is handled honestly per series (raw points plus
// an explicit "not enough yet"), and the charts never use a misleading truncated axis
// (the axis logic is the tested domain/progress/chartScale module).
export default function ProgressScreen() {
  const router = useRouter();
  const { reload, setWeeks, state, weeks } = useProgressDashboard();
  const { isOffline } = useNetworkStatus();

  // Reload when returning to the tab so a freshly logged reading appears.
  useFocusEffect(
    useCallback(() => {
      reload();
    }, [reload]),
  );

  // While offline with nothing loaded we cannot draw the dashboard from Supabase; once a
  // window has loaded it stays visible. (Cached offline reads are a later concern.)
  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Trends, not judgement" title="Progress">
      {showOffline ? (
        <OfflineState description="Your trends will appear here once you are back online." />
      ) : (
        <>
          <ProgressDashboardView
            onSelectWeeks={setWeeks}
            state={state}
            weeks={weeks}
          />
          <SecondaryButton
            label="Weekly review"
            onPress={() => router.push('/(tabs)/progress/review')}
          />
        </>
      )}
    </AppScreen>
  );
}
