import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { AuthLoadingScreen } from '@/features/auth/AuthLoadingScreen';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { getAuthGuards } from '@/features/auth/authRouting';

export default function RootLayout() {
  return (
    <AuthProvider>
      <RootNavigator />
    </AuthProvider>
  );
}

function RootNavigator() {
  const { status } = useAuth();
  const guards = getAuthGuards(status);

  if (status === 'loading') {
    return <AuthLoadingScreen />;
  }

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Protected guard={guards.allowPublic}>
          <Stack.Screen name="(auth)" />
        </Stack.Protected>
        <Stack.Protected guard={guards.allowPrivate}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="(onboarding)" />
        </Stack.Protected>
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}
