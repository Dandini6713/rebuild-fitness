import { describe, expect, it, jest } from '@jest/globals';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { Session } from '@supabase/supabase-js';

import { AppText, PrimaryButton } from '@/components/common';
import { AuthProvider, useAuth } from '@/features/auth/AuthProvider';
import { AuthService } from '@/lib/auth/authService';

const session = {
  user: { id: '11111111-1111-4111-8111-111111111111' },
} as Session;

function StatusProbe() {
  const { status } = useAuth();
  return <AppText>{status}</AppText>;
}

function SignOutProbe() {
  const { signOut, status } = useAuth();
  return (
    <>
      <AppText>{status}</AppText>
      <PrimaryButton label="Test sign out" onPress={signOut} />
    </>
  );
}

function SignInProbe() {
  const { signIn, status } = useAuth();
  return (
    <>
      <AppText>{status}</AppText>
      <PrimaryButton
        label="Test sign in"
        onPress={() => signIn('danny@example.com', 'secret')}
      />
    </>
  );
}

function createService(initialSession: Session | null): AuthService {
  return {
    getSession: jest.fn(async () => ({ session: initialSession })),
    signIn: jest.fn(async () => ({ session, success: true as const })),
    signOut: jest.fn(async () => ({ success: true as const })),
    subscribe: jest.fn(() => jest.fn()),
  };
}

describe('AuthProvider', () => {
  it('shows loading until session restoration resolves, then protects private routes', async () => {
    const service = createService(session);
    let resolveSession: ((value: { session: Session }) => void) | undefined;
    service.getSession = jest.fn(
      () =>
        new Promise<{ session: Session }>((resolve) => {
          resolveSession = resolve;
        }),
    );
    const view = await render(
      <AuthProvider service={service}>
        <StatusProbe />
      </AuthProvider>,
    );

    expect(view.getByText('loading')).toBeOnTheScreen();
    resolveSession?.({ session });
    await waitFor(() =>
      expect(view.getByText('authenticated')).toBeOnTheScreen(),
    );
  });

  it('settles as unauthenticated when no stored session exists', async () => {
    const view = await render(
      <AuthProvider service={createService(null)}>
        <StatusProbe />
      </AuthProvider>,
    );

    await waitFor(() =>
      expect(view.getByText('unauthenticated')).toBeOnTheScreen(),
    );
  });

  it('uses a safe configuration-error state when no client is available', async () => {
    const view = await render(
      <AuthProvider service={null}>
        <StatusProbe />
      </AuthProvider>,
    );

    expect(view.getByText('configuration_error')).toBeOnTheScreen();
  });

  it('removes authenticated access after a successful sign-out', async () => {
    const service = createService(session);
    const view = await render(
      <AuthProvider service={service}>
        <SignOutProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(view.getByText('authenticated')).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Test sign out' }));
    });

    await waitFor(() =>
      expect(view.getByText('unauthenticated')).toBeOnTheScreen(),
    );
    expect(service.signOut).toHaveBeenCalledTimes(1);
  });

  it('grants authenticated access only after successful sign-in', async () => {
    const service = createService(null);
    const view = await render(
      <AuthProvider service={service}>
        <SignInProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(view.getByText('unauthenticated')).toBeOnTheScreen(),
    );

    await act(async () => {
      fireEvent.press(view.getByRole('button', { name: 'Test sign in' }));
    });

    expect(view.getByText('authenticated')).toBeOnTheScreen();
    expect(service.signIn).toHaveBeenCalledWith('danny@example.com', 'secret');
  });

  it('responds to provider-driven session revocation', async () => {
    let authCallback: ((session: Session | null) => void) | undefined;
    const service = createService(session);
    service.subscribe = jest.fn(
      (callback: (session: Session | null) => void) => {
        authCallback = callback;
        return jest.fn();
      },
    );
    const view = await render(
      <AuthProvider service={service}>
        <StatusProbe />
      </AuthProvider>,
    );
    await waitFor(() =>
      expect(view.getByText('authenticated')).toBeOnTheScreen(),
    );

    await act(async () => authCallback?.(null));

    expect(view.getByText('unauthenticated')).toBeOnTheScreen();
  });
});
