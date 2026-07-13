import { useRouter } from 'expo-router';

import {
  AppScreen,
  OfflineState,
  PrimaryButton,
  SecondaryButton,
} from '@/components/common';
import { FoodDiaryView } from '@/features/nutrition/FoodDiaryView';
import { useNutritionDiary } from '@/features/nutrition/useNutritionDiary';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 19, S-031: the food diary — the day's entries grouped by meal with running
// totals and progress against the current effective target. A plain owner-scoped read
// under RLS; nutrition has no safety rule to gate. Loading/empty/error/offline states.
export default function FoodDiaryScreen() {
  const router = useRouter();
  const diary = useNutritionDiary();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && diary.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Nutrition" title="Food diary">
      {showOffline ? (
        <OfflineState description="Your food diary will appear here once you are back online." />
      ) : (
        <>
          <FoodDiaryView state={diary.state} />
          <PrimaryButton
            label="Add food or quick entry"
            onPress={() => router.push('/log/food')}
          />
          <SecondaryButton
            label="Log a saved meal"
            onPress={() => router.push('/log/meals')}
          />
          <SecondaryButton
            label="Daily targets"
            onPress={() => router.push('/log/targets')}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
