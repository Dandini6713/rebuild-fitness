import { useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { WeeklyReviewView } from '@/features/review/WeeklyReviewView';
import { useWeeklyReview } from '@/features/review/useWeeklyReview';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 23, docs/03 S-041: the weekly review interface. It renders the six S-041 sections
// over the metrics and recommendations roadmap 22 computes — what happened, what improved,
// what needs attention, safety and recovery, proposed changes and confirmation — and drives
// the CONFIRM-BEFORE-APPLY flow. Accepting a calorie proposal inserts a new effective-dated
// nutrition_targets row; accepting a strength / running proposal marks it accepted; every
// confirmation records an audit event. All of that happens atomically in the confirm RPC,
// and NOTHING is applied until the user taps the final Confirm (docs/10 §10.2).
//
// Framing is non-diagnostic and non-shaming (docs/07); a calorie reduction held at the
// safety floor shows the professional-review escalation before it can be accepted.
export default function WeeklyReviewScreen() {
  const router = useRouter();
  const review = useWeeklyReview();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && review.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Weekly review" title="Your week">
      {showOffline ? (
        <OfflineState description="Your weekly review will appear here once you are back online." />
      ) : (
        <>
          <WeeklyReviewView
            callbacks={{
              onCancel: review.cancelPending,
              onConfirm: review.confirmPending,
              onGenerate: review.generate,
              onRequestDecision: review.requestDecision,
            }}
            state={review.state}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
