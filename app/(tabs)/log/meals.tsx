import { useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  OfflineState,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { MealTemplatesView } from '@/features/nutrition/MealTemplatesView';
import { useFoodLibrary } from '@/features/nutrition/useFoodLibrary';
import { useFoodLog } from '@/features/nutrition/useFoodLog';
import { useMealTemplates } from '@/features/nutrition/useMealTemplates';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 19, docs/05 §5.7: saved meals — a reusable collection of foods that logs as a
// whole (expanding into one nutrition_logs row per item). Build one from your foods, then
// log it in a single tap. Plain owner-scoped inserts under RLS.
export default function SavedMealsScreen() {
  const router = useRouter();
  const templates = useMealTemplates();
  const library = useFoodLibrary();
  const foodLog = useFoodLog();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && templates.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Nutrition" title="Saved meals">
      {showOffline ? (
        <OfflineState description="Your saved meals will appear here once you are back online." />
      ) : (
        <>
          {foodLog.state.status === 'saved' ? (
            <StatusBadge label="Meal added to your diary" tone="success" />
          ) : null}
          {foodLog.state.status === 'error' ? (
            <AppText accessibilityLiveRegion="assertive" variant="body">
              {foodLog.state.message}
            </AppText>
          ) : null}
          <MealTemplatesView
            foods={library.state}
            logging={foodLog.state.status === 'submitting'}
            onLog={foodLog.logMealTemplate}
            onSave={templates.saveTemplate}
            saveState={templates.saveState}
            state={templates.state}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
