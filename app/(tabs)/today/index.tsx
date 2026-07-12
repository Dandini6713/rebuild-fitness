import { AppScreen, EmptyState, OfflineState } from '@/components/common';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 07 seam: Today is deliberately a shell. Roadmap 08 ("Today screen
// with real data") wires in today's scheduled session, nutrition targets and
// recent logs, and swaps this empty state for the real session card, primary
// "Start session" action and adherence summary. Until then this shows an honest
// empty state and the offline state, with no invented sessions or numbers.
export default function TodayScreen() {
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Your day" title="Today">
      {isOffline ? (
        <OfflineState description="Your planned session and progress will appear here once you are back online." />
      ) : (
        <EmptyState
          description="Once your plan is underway, today's session, your calorie and protein progress and how the week is going will appear here."
          title="Nothing to show just yet"
        />
      )}
    </AppScreen>
  );
}
