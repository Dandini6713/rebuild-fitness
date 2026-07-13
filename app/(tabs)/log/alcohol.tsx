import { useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { AlcoholLogView } from '@/features/alcohol/AlcoholLogView';
import { useAlcoholLog } from '@/features/alcohol/useAlcoholLog';
import { useDrinkFavourites } from '@/features/alcohol/useDrinkFavourites';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 20, S-033: record a drink — a manual entry, or a one-tap log from a saved
// favourite. Units are computed by the pure domain function; calories are the user's own
// estimate (docs/06 §6.9). Plain owner-scoped inserts under RLS; offline fails honestly
// rather than pretending it saved. A neutral tracker: no moralising, no compensation copy
// (docs/07 §7.4).
export default function AlcoholLogScreen() {
  const router = useRouter();
  const alcohol = useAlcoholLog();
  const favourites = useDrinkFavourites();
  const { isOffline } = useNetworkStatus();

  return (
    <AppScreen eyebrow="Alcohol" title="Record a drink">
      {isOffline ? (
        <StatusBadge
          label="Offline — you can log this once you are back online"
          tone="info"
        />
      ) : null}

      {alcohol.state.status === 'saved' ? (
        <StatusBadge label="Drink recorded" tone="success" />
      ) : null}
      {alcohol.state.status === 'offline' ? (
        <AppText accessibilityLiveRegion="polite" variant="body">
          You appear to be offline, so this was not saved. Please try again when
          you are back online.
        </AppText>
      ) : null}
      {alcohol.state.status === 'error' ? (
        <AppText accessibilityLiveRegion="assertive" variant="body">
          {alcohol.state.message}
        </AppText>
      ) : null}

      <AlcoholLogView
        favourites={favourites.state}
        onCreateFavourite={() => router.push('/log/drink-new')}
        onLogDrink={alcohol.logDrink}
        onLogFavourite={alcohol.logFromFavourite}
        submitting={alcohol.state.status === 'submitting'}
      />

      <SecondaryButton
        label="View weekly summary"
        onPress={() => router.push('/log/alcohol-week')}
      />
      <SecondaryButton
        label="Weekly limit"
        onPress={() => router.push('/log/alcohol-limit')}
      />
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </AppScreen>
  );
}
