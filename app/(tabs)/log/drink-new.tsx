import { useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { DrinkFavouriteFormView } from '@/features/alcohol/DrinkFavouriteFormView';
import { useAlcoholLog } from '@/features/alcohol/useAlcoholLog';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 20, S-033: save a reusable drink favourite (the foods parallel for alcohol). A
// plain owner-scoped insert into drink_favourites under RLS; validation is the boundary,
// units are derived. Offline fails honestly. Neutral copy (docs/07 §7.4).
export default function CreateDrinkScreen() {
  const router = useRouter();
  const alcohol = useAlcoholLog();
  const { isOffline } = useNetworkStatus();

  if (alcohol.state.status === 'saved') {
    return (
      <AppScreen eyebrow="Alcohol" title="Save a drink">
        <Card>
          <StatusBadge label="Drink saved" tone="success" />
          <AppText variant="body">
            Your drink is saved. You can log it in one tap from Record a drink.
          </AppText>
          <PrimaryButton
            label="Back to record a drink"
            onPress={() => router.replace('/log/alcohol')}
          />
          <SecondaryButton label="Save another" onPress={alcohol.reset} />
        </Card>
      </AppScreen>
    );
  }

  return (
    <AppScreen eyebrow="Alcohol" title="Save a drink">
      {isOffline ? (
        <StatusBadge
          label="Offline — you can save this once you are back online"
          tone="info"
        />
      ) : null}
      <DrinkFavouriteFormView
        onSubmit={alcohol.saveFavourite}
        submitting={alcohol.state.status === 'submitting'}
      />
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
      <SecondaryButton label="Back" onPress={() => router.back()} />
    </AppScreen>
  );
}
