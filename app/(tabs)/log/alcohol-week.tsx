import { useRouter } from 'expo-router';

import {
  AppScreen,
  OfflineState,
  PrimaryButton,
  SecondaryButton,
} from '@/components/common';
import { WeeklyAlcoholSummaryView } from '@/features/alcohol/WeeklyAlcoholSummaryView';
import { useAlcoholSummary } from '@/features/alcohol/useAlcoholSummary';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 20, docs/06 §6.9: the weekly alcohol summary — total drinks, total units,
// estimated calories, alcohol-free days, and (when a personal limit is set) percentage of
// that limit. Totals and free days use the roadmap-19 local-day window. A plain
// owner-scoped read under RLS. A neutral tracker: it records and totals, never judges
// (docs/07 §7.4). Loading/empty/error/offline states.
export default function AlcoholWeekScreen() {
  const router = useRouter();
  const summary = useAlcoholSummary();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && summary.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Alcohol" title="Weekly summary">
      {showOffline ? (
        <OfflineState description="Your weekly summary will appear here once you are back online." />
      ) : (
        <>
          <WeeklyAlcoholSummaryView state={summary.state} />
          <PrimaryButton
            label="Record a drink"
            onPress={() => router.push('/log/alcohol')}
          />
          <SecondaryButton
            label="Weekly limit"
            onPress={() => router.push('/log/alcohol-limit')}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
