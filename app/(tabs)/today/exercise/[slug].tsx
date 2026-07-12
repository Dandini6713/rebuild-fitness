import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { ExerciseGuideView } from '@/features/catalogue/ExerciseGuideView';
import { useExerciseGuide } from '@/features/catalogue/useExerciseGuide';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// The S-013 Exercise guide reached from an exercise card inside the workout player
// (roadmap 11). It reuses the roadmap 10 catalogue feature verbatim; the only
// difference from the More-tab guide is that it is pushed within the Today stack,
// so tapping "How to do this exercise" (or "View approved alternatives") stays in
// the session's context rather than jumping tabs.
export default function WorkoutExerciseGuideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const state = useExerciseGuide(slug);
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Exercise guide" title="How to do this exercise">
      <SecondaryButton
        accessibilityHint="Returns to your session."
        label="Back"
        onPress={() => router.back()}
      />
      {showOffline ? (
        <OfflineState description="This exercise guide will load here once you are back online." />
      ) : (
        <ExerciseGuideView state={state} />
      )}
    </AppScreen>
  );
}
