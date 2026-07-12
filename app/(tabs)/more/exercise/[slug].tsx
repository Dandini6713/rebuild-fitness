import { useLocalSearchParams, useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { ExerciseGuideView } from '@/features/catalogue/ExerciseGuideView';
import { useExerciseGuide } from '@/features/catalogue/useExerciseGuide';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 10, S-013: the Exercise guide for one exercise, reached from the
// catalogue list. Seven sections in order (equipment setup, starting position,
// movement, breathing, common mistakes, stop criteria, approved alternatives),
// each omitted when it has no content. The guide is read-only reference; the
// workout player that will link to it in context is roadmap 11.
export default function ExerciseGuideScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ slug: string }>();
  const slug = typeof params.slug === 'string' ? params.slug : '';
  const state = useExerciseGuide(slug);
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Exercise guide" title="How to do this exercise">
      <SecondaryButton
        accessibilityHint="Returns to the exercise list."
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
