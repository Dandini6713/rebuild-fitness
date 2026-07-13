import { useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  Card,
  OfflineState,
  PrimaryButton,
  SecondaryButton,
} from '@/components/common';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// The log hub (docs/03 S-030). The logging actions are Food, Weight, Waist and (later)
// Alcohol. Roadmap 18 delivered Weight and Waist; roadmap 19 delivers Food (the diary,
// personal foods, quick entries, saved meals and daily targets). Alcohol is roadmap 20,
// shown here as an honest, clearly-disabled placeholder rather than hidden, so the shape
// of the hub is truthful about what works today.
export default function LogScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Keep it honest, keep it useful" title="Log">
      {isOffline ? (
        <OfflineState description="You will be able to record food, weight and waist here once you are back online." />
      ) : (
        <>
          <Card>
            <AppText variant="heading">Food and nutrition</AppText>
            <AppText tone="secondary" variant="body">
              Keep your food diary, log a quick entry, save foods and meals, and
              set your daily calorie and protein targets.
            </AppText>
            <PrimaryButton
              label="Open food diary"
              onPress={() => router.push('/log/diary')}
            />
            <SecondaryButton
              label="Add food or quick entry"
              onPress={() => router.push('/log/food')}
            />
            <SecondaryButton
              label="Daily targets"
              onPress={() => router.push('/log/targets')}
            />
          </Card>

          <Card>
            <AppText variant="heading">Measurements</AppText>
            <AppText tone="secondary" variant="body">
              Record your weight and waist. Your readings and your weight trend
              live in your measurement history.
            </AppText>
            <PrimaryButton
              label="Log weight"
              onPress={() => router.push('/log/measurement?type=weight')}
            />
            <SecondaryButton
              label="Log waist"
              onPress={() => router.push('/log/measurement?type=waist')}
            />
            <SecondaryButton
              label="View measurement history"
              onPress={() => router.push('/log/history')}
            />
          </Card>

          <Card>
            <AppText variant="heading">Alcohol</AppText>
            <AppText tone="secondary" variant="body">
              Logging lager or alcohol opens up in a later step. It is not ready
              yet.
            </AppText>
            <SecondaryButton
              disabled
              label="Log lager or alcohol (coming later)"
              onPress={() => {}}
            />
          </Card>
        </>
      )}
    </AppScreen>
  );
}
