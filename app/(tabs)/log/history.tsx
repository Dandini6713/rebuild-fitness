import { useRouter } from 'expo-router';

import { AppScreen, OfflineState, SecondaryButton } from '@/components/common';
import { MeasurementHistoryView } from '@/features/measurements/MeasurementHistoryView';
import { useMeasurements } from '@/features/measurements/useMeasurements';
import { useNetworkStatus } from '@/lib/network/useNetworkStatus';

// Roadmap 18, S-034 / docs/06 §6.6: the measurement history and the weight trend. The
// raw readings and the smoothed trend are presented SEPARATELY by MeasurementHistoryView
// so a trend is never mistaken for a measurement, and when there is not enough data for a
// trend the raw values still show with a plain explanation of why.
export default function MeasurementHistoryScreen() {
  const router = useRouter();
  const measurements = useMeasurements();
  const { isOffline } = useNetworkStatus();

  const showOffline = isOffline && measurements.state.status !== 'ready';

  return (
    <AppScreen eyebrow="Measurements" title="Your measurements">
      {showOffline ? (
        <OfflineState description="Your measurements and weight trend will appear here once you are back online." />
      ) : (
        <>
          <MeasurementHistoryView state={measurements.state} />
          <SecondaryButton label="Back" onPress={() => router.back()} />
        </>
      )}
    </AppScreen>
  );
}
