import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';

import {
  deriveIsOffline,
  useNetworkStatus,
} from '@/lib/network/useNetworkStatus';

const mockUseNetworkState = jest.fn();

jest.mock('expo-network', () => ({
  useNetworkState: () => mockUseNetworkState(),
}));

describe('deriveIsOffline', () => {
  it('reports offline when the device is not connected', () => {
    expect(deriveIsOffline({ isConnected: false }, 'ios')).toBe(true);
  });

  it('reports offline when the internet is unreachable', () => {
    expect(
      deriveIsOffline({ isConnected: true, isInternetReachable: false }, 'ios'),
    ).toBe(true);
  });

  it('reports online when connected and reachable', () => {
    expect(
      deriveIsOffline({ isConnected: true, isInternetReachable: true }, 'ios'),
    ).toBe(false);
  });

  it('treats undefined signals as online to avoid a false offline flash', () => {
    expect(deriveIsOffline({}, 'ios')).toBe(false);
  });

  it('always reports online on web, where the signal is not meaningful', () => {
    expect(deriveIsOffline({ isConnected: false }, 'web')).toBe(false);
    expect(
      deriveIsOffline({ isConnected: true, isInternetReachable: false }, 'web'),
    ).toBe(false);
  });
});

describe('useNetworkStatus', () => {
  beforeEach(() => {
    mockUseNetworkState.mockReset();
  });

  it('is offline when the module reports no connection', async () => {
    mockUseNetworkState.mockReturnValue({
      isConnected: false,
      isInternetReachable: false,
    });

    const { result } = await renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(true);
  });

  it('is online when the module reports a reachable connection', async () => {
    mockUseNetworkState.mockReturnValue({
      isConnected: true,
      isInternetReachable: true,
    });

    const { result } = await renderHook(() => useNetworkStatus());
    expect(result.current.isOffline).toBe(false);
  });
});
