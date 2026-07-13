import { useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { NutritionTargetView } from '@/features/nutrition/NutritionTargetView';
import { useNutritionTargets } from '@/features/nutrition/useNutritionTargets';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 19, docs/05 §5.7 / docs/06 §6.8: the effective-dated calorie and protein
// targets. Setting a new target INSERTS a new dated row (never overwrites), so history is
// kept; the current target is the latest effective_from on or before today. A plain
// owner-scoped insert under RLS. The adaptive calorie proposal (§6.7) is roadmap 22.
export default function NutritionTargetsScreen() {
  const router = useRouter();
  const targets = useNutritionTargets();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && targets.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Nutrition" title="Daily targets">
      {showOffline ? (
        <OfflineState description="Your daily targets will appear here once you are back online." />
      ) : (
        <>
          <NutritionTargetView
            onSetTarget={targets.setTarget}
            setState={targets.setState}
            state={targets.state}
          />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
