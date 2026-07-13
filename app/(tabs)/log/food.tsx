import { useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { FoodEntryView } from '@/features/nutrition/FoodEntryView';
import { useFoodLibrary } from '@/features/nutrition/useFoodLibrary';
import { useFoodLog } from '@/features/nutrition/useFoodLog';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 19, S-031/S-032: add to the diary — a quick calories-and-protein entry, or log
// a recent/favourite/saved food (scaled by servings). Plain owner-scoped inserts under
// RLS; offline fails honestly rather than pretending it saved.
export default function FoodEntryScreen() {
  const router = useRouter();
  const foodLog = useFoodLog();
  const library = useFoodLibrary();
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Nutrition" title="Add food">
      {isOffline ? (
        <StatusBadge
          label="Offline — you can log this once you are back online"
          tone="info"
        />
      ) : null}

      {foodLog.state.status === 'saved' ? (
        <StatusBadge label="Added to your diary" tone="success" />
      ) : null}
      {foodLog.state.status === 'offline' ? (
        <AppText accessibilityLiveRegion="polite" variant="body">
          You appear to be offline, so this was not saved. Please try again when
          you are back online.
        </AppText>
      ) : null}
      {foodLog.state.status === 'error' ? (
        <AppText accessibilityLiveRegion="assertive" variant="body">
          {foodLog.state.message}
        </AppText>
      ) : null}

      <FoodEntryView
        foods={library.state}
        onCreateFood={() => router.push('/log/food-new')}
        onLogFood={foodLog.logSavedFood}
        onLogQuickEntry={foodLog.logQuickEntry}
        onOpenSavedMeals={() => router.push('/log/meals')}
        submitting={foodLog.state.status === 'submitting'}
      />

      <SecondaryButton
        label="View diary"
        onPress={() => router.replace('/log/diary')}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </AppScreen>
  );
}
