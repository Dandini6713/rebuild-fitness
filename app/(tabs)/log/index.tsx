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

// The log hub (docs/03 S-030). The logging actions are Food, Weight, Waist and Alcohol.
// Roadmap 18 delivered Weight and Waist; roadmap 19 delivered Food (the diary, personal
// foods, quick entries, saved meals and daily targets); roadmap 20 delivers Alcohol (a
// neutral drink log, reusable drink favourites and a weekly summary — docs/06 §6.9).
export default function LogScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Keep it honest, keep it useful" title="Log">
      {isOffline ? (
        <OfflineState description="You will be able to record food, weight, waist and alcohol here once you are back online." />
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
              Record a drink, save drinks you have often, and see your weekly
              totals. Units are estimated; this is a plain record, not a
              judgement.
            </AppText>
            <PrimaryButton
              label="Record a drink"
              onPress={() => router.push('/log/alcohol')}
            />
            <SecondaryButton
              label="Weekly summary"
              onPress={() => router.push('/log/alcohol-week')}
            />
          </Card>
        </>
      )}
    </AppScreen>
  );
}
