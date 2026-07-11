import { describe, expect, it, jest } from '@jest/globals';
import { AuthChangeEvent, Session } from '@supabase/supabase-js';

import {
  createAuthService,
  SupabaseAuthBoundary,
} from '@/lib/auth/authService';

function createBoundary(
  overrides: Partial<SupabaseAuthBoundary> = {},
): SupabaseAuthBoundary {
  return {
    getSession: jest.fn(async () => ({ data: { session: null }, error: null })),
    onAuthStateChange: jest.fn(() => ({
      data: { subscription: { unsubscribe: jest.fn() } },
    })),
    signInWithPassword: jest.fn(async () => ({
      data: { session: null },
      error: null,
    })),
    signOut: jest.fn(async () => ({ error: null })),
    ...overrides,
  };
}

describe('authentication service', () => {
  it('restores a valid session and treats provider errors as signed out', async () => {
    const validSession = { user: { id: 'user-a' } } as never;
    const validService = createAuthService(
      createBoundary({
        getSession: jest.fn(async () => ({
          data: { session: validSession },
          error: null,
        })),
      }),
    );
    const failedService = createAuthService(
      createBoundary({
        getSession: jest.fn(async () => ({
          data: { session: validSession },
          error: { message: 'expired' },
        })),
      }),
    );

    await expect(validService.getSession()).resolves.toEqual({
      session: validSession,
    });
    await expect(failedService.getSession()).resolves.toEqual({
      session: null,
    });
  });

  it('forwards auth changes and unsubscribes cleanly', () => {
    const unsubscribe = jest.fn();
    let providerCallback:
      ((event: 'SIGNED_OUT', session: null) => void) | undefined;
    const boundary = createBoundary({
      onAuthStateChange: jest.fn(
        (
          callback: (event: AuthChangeEvent, session: Session | null) => void,
        ) => {
          providerCallback = callback;
          return { data: { subscription: { unsubscribe } } };
        },
      ),
    });
    const listener = jest.fn();
    const stop = createAuthService(boundary).subscribe(listener);

    providerCallback?.('SIGNED_OUT', null);
    stop();

    expect(listener).toHaveBeenCalledWith(null);
    expect(unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('returns the authenticated session after valid credentials', async () => {
    const session = { user: { id: 'user-a' } } as never;
    const service = createAuthService(
      createBoundary({
        signInWithPassword: jest.fn(async () => ({
          data: { session },
          error: null,
        })),
      }),
    );

    await expect(
      service.signIn('danny@example.com', 'secret'),
    ).resolves.toEqual({ session, success: true });
  });

  it('returns a generic sign-in error without exposing provider details', async () => {
    const boundary = createBoundary({
      signInWithPassword: jest.fn(async () => ({
        data: { session: null },
        error: { message: 'User for danny@example.com does not exist' },
      })),
    });
    const service = createAuthService(boundary);

    await expect(
      service.signIn('danny@example.com', 'secret'),
    ).resolves.toEqual({
      message: 'We could not sign you in. Check your details and try again.',
      success: false,
    });
  });

  it('signs out the local session so protected screens can be removed', async () => {
    const signOut = jest.fn(async () => ({ error: null }));
    const service = createAuthService(createBoundary({ signOut }));

    await expect(service.signOut()).resolves.toEqual({ success: true });
    expect(signOut).toHaveBeenCalledWith({ scope: 'local' });
  });

  it('returns a generic error when local sign-out fails', async () => {
    const service = createAuthService(
      createBoundary({
        signOut: jest.fn(async () => ({
          error: { message: 'provider detail' },
        })),
      }),
    );

    await expect(service.signOut()).resolves.toEqual({
      message:
        'We could not sign you out. Check your connection and try again.',
      success: false,
    });
  });
});
