// Connectivity detection for the offline states AGENTS.md requires. Kept in a
// small hook (not inline in screens) so every screen reports offline the same
// way and the derivation can be unit-tested without a device.
//
// Mechanism: expo-network's `useNetworkState`, chosen from docs/04 §4.1 (Expo
// native modules) so the version stays SDK-compatible. On web, connectivity
// reported by the native module is not meaningful, so we degrade to "online"
// and never surface an offline state there.

import { useNetworkState } from 'expo-network';
import { useMemo } from 'react';
import { Platform } from 'react-native';

export type NetworkStatus = { isOffline: boolean };

type NetworkSignal = {
  isConnected?: boolean | undefined;
  isInternetReachable?: boolean | undefined;
};

// Pure so it can be exhaustively tested. We only report offline on a definite
// negative signal; an undefined field (module still resolving, or a platform
// that cannot tell) is treated as online to avoid flashing an offline panel on
// first render.
export function deriveIsOffline(
  signal: NetworkSignal,
  platformOS: string,
): boolean {
  if (platformOS === 'web') {
    return false;
  }
  if (signal.isConnected === false) {
    return true;
  }
  if (signal.isInternetReachable === false) {
    return true;
  }
  return false;
}

export function useNetworkStatus(): NetworkStatus {
  const state = useNetworkState();
  const isOffline = useMemo(
    () =>
      deriveIsOffline(
        {
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        },
        Platform.OS,
      ),
    [state.isConnected, state.isInternetReachable],
  );

  return { isOffline };
}
