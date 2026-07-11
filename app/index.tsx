import { Redirect } from 'expo-router';

import { useAuth } from '@/features/auth/AuthProvider';

export default function IndexScreen() {
  const { status } = useAuth();
  return status === 'authenticated' ? (
    <Redirect href="/(tabs)/today" />
  ) : (
    <Redirect href="/(auth)/sign-in" />
  );
}
