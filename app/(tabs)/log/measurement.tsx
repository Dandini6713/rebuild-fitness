import { useLocalSearchParams, useRouter } from 'expo-router';

import {
  AppScreen,
  AppText,
  Card,
  PrimaryButton,
  SecondaryButton,
  StatusBadge,
} from '@/components/common';
import { MeasurementFormView } from '@/features/measurements/MeasurementFormView';
import {
  MEASUREMENT_CONFIG,
  MEASUREMENT_TYPES,
  type MeasurementType,
} from '@/features/measurements/measurementSchema';
import { useMeasurementLog } from '@/features/measurements/useMeasurementLog';
import { useMeasurements } from '@/features/measurements/useMeasurements';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 18, S-034: the weight/waist entry form. A plain owner-scoped insert under RLS
// — there is no safety gate a client could violate by logging a measurement, so no
// trusted RPC. The form validates every field (Zod) before writing; offline fails
// honestly rather than pretending it saved.
function resolveType(raw: string | undefined): MeasurementType {
  return raw && (MEASUREMENT_TYPES as readonly string[]).includes(raw)
    ? (raw as MeasurementType)
    : 'weight';
}

export default function MeasurementEntryScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ type?: string }>();
  const type = resolveType(
    typeof params.type === 'string' ? params.type : undefined,
  );
  const config = MEASUREMENT_CONFIG[type];

  const { state, submit, reset } = useMeasurementLog(type);
  // The most recent value of this type, for the "most recent" guidance (S-034).
  const measurements = useMeasurements();
  const { isOffline } = useNetworkStatus();

  const recentValueLabel = (() => {
    if (measurements.state.status !== 'ready') {
      return undefined;
    }
    const records =
      type === 'weight'
        ? measurements.state.data.weight
        : measurements.state.data.waist;
    const latest = records[0];
    return latest ? `${latest.value} ${latest.unit}` : undefined;
  })();

  return (
    <AppScreen eyebrow="Measurement" title={`Log ${config.noun}`}>
      {isOffline ? (
        <StatusBadge
          label="Offline — you can save this once you are back online"
          tone="info"
        />
      ) : null}

      {state.status === 'saved' ? (
        <Card>
          <StatusBadge label="Saved" tone="success" />
          <AppText variant="body">{`Your ${config.noun} is saved.`}</AppText>
          <PrimaryButton
            label="View measurement history"
            onPress={() => router.replace('/log/history')}
          />
          <SecondaryButton label="Log another" onPress={reset} />
          <SecondaryButton label="Done" onPress={() => router.back()} />
        </Card>
      ) : (
        <>
          <MeasurementFormView
            onSubmit={submit}
            recentValueLabel={recentValueLabel}
            submitting={state.status === 'submitting'}
            type={type}
          />
          {state.status === 'offline' ? (
            <AppText accessibilityLiveRegion="polite" variant="body">
              You appear to be offline, so this was not saved. Please try again
              when you are back online.
            </AppText>
          ) : null}
          {state.status === 'error' ? (
            <AppText accessibilityLiveRegion="assertive" variant="body">
              {state.message}
            </AppText>
          ) : null}
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
