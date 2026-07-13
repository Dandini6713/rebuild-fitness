import { useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { FoodFormView } from '@/features/nutrition/FoodFormView';
import { useFoodLog } from '@/features/nutrition/useFoodLog';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 19, S-032: create a reusable personal food. A plain owner-scoped insert into
// foods under RLS; validation is the boundary. Offline fails honestly.
export default function CreateFoodScreen() {
  const router = useRouter();
  const foodLog = useFoodLog();
  const { isOffline } = useNetworkStatus();

  if (foodLog.state.status === 'saved') {
    return (
      <AppScreen eyebrow="Nutrition" title="Add food">
        <Card>
          <StatusBadge label="Food saved" tone="success" />
          <AppText variant="body">
            Your food is saved. You can log it from Add food.
          </AppText>
          <PrimaryButton
            label="Back to add food"
            onPress={() => router.replace('/log/food')}
          />
          <SecondaryButton label="Add another" onPress={foodLog.reset} />
        </Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen eyebrow="Nutrition" title="Add food">
      {isOffline ? (
        <StatusBadge
          label="Offline — you can save this once you are back online"
          tone="info"
        />
      ) : null}
      <FoodFormView
        onSubmit={foodLog.saveFood}
        submitting={foodLog.state.status === 'submitting'}
      />
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
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </AppScreen>
  );
}
