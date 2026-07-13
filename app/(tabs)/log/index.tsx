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

// The log hub (docs/03 S-030). The four logging actions are Food, Alcohol, Weight and
// Waist. Roadmap 18 delivers Weight and Waist as real owner-scoped logging; Food and
// Alcohol are later roadmap items, shown here as honest, clearly-disabled placeholders
// rather than hidden, so the shape of the hub is truthful about what works today.
export default function LogScreen() {
  const router = useRouter();
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Keep it honest, keep it useful" title="Log">
      {isOffline ? (
        <OfflineState description="You will be able to record weight and waist here once you are back online." />
      ) : (
        <>
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
            <AppText variant="heading">Food and drink</AppText>
            <AppText tone="secondary" variant="body">
              Logging food, and lager or alcohol, opens up in a later step. It
              is not ready yet.
            </AppText>
            <SecondaryButton
              disabled
              label="Log food (coming later)"
              onPress={() => {}}
            />
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
