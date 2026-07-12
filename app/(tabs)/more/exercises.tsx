import { useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { ExerciseCatalogueView } from '@/features/catalogue/ExerciseCatalogueView';
import { useExerciseCatalogue } from '@/features/catalogue/useExerciseCatalogue';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 10: the browsable exercise catalogue, reached from the More tab. A
// minimal list grouped into the two strength sessions; tapping an exercise opens
// its S-013 guide. Domain shaping lives in domain/training/exerciseCatalogue; the
// read model and states live in features/catalogue.
export default function ExerciseCatalogueScreen() {
  const router = useRouter();
  const state = useExerciseCatalogue();
  const { isOffline } = useNetworkStatus();

  // The catalogue is shared reference data loaded from Supabase, so an offline
  // connection with nothing loaded shows the offline state. Cached reads are a
  // later concern.
  const showOffline = isOffline && state.status !== 'ready';

  return (
    <AppScreen eyebrow="Learn" title="Exercise guide">
      <SecondaryButton
        accessibilityHint="Returns to the More tab."
        label="Back"
        onPress={() => router.back()}
      />
      {showOffline ? (
        <OfflineState description="The exercise guide will load here once you are back online." />
      ) : (
        <ExerciseCatalogueView
          onOpen={(slug) => router.push(`/more/exercise/${slug}`)}
          state={state}
        />
      )}
    </AppScreen>
  );
}
