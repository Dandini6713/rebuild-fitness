import { Session } from '@supabase/supabase-js';
import {
  createContext,
  PropsWithChildren,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState, Platform } from 'react-native';

import { AuthService, createAuthService } from '@/lib/auth/authService';
import { supabase } from '@/lib/supabase';

import { AuthStatus } from './authRouting';

type AuthContextValue = {
  session: Session | null;
  signIn(email: string, password: string): ReturnType<AuthService['signIn']>;
  signOut(): ReturnType<AuthService['signOut']>;
  status: AuthStatus;
};

const AuthContext = createContext<AuthContextValue | null>(null);
const defaultService = supabase ? createAuthService(supabase.auth) : null;

type AuthProviderProps = PropsWithChildren<{ service?: AuthService | null }>;

export function AuthProvider({
  children,
  service = defaultService,
}: AuthProviderProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    service ? 'loading' : 'configuration_error',
  );

  useEffect(() => {
    if (!service) {
      return;
    }

    let active = true;
    let receivedAuthEvent = false;
    const unsubscribe = service.subscribe((nextSession) => {
      if (active) {
        receivedAuthEvent = true;
        setSession(nextSession);
        setStatus(nextSession ? 'authenticated' : 'unauthenticated');
      }
    });

    void service.getSession().then(({ session: storedSession }) => {
      if (active && !receivedAuthEvent) {
        setSession(storedSession);
        setStatus(storedSession ? 'authenticated' : 'unauthenticated');
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, [service]);

  useEffect(() => {
    const client = supabase;
    if (!client || Platform.OS === 'web') {
      return;
    }

    if (AppState.currentState === 'active') {
      client.auth.startAutoRefresh();
    }
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        client.auth.startAutoRefresh();
      } else {
        client.auth.stopAutoRefresh();
      }
    });

    return () => {
      subscription.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      session,
      async signIn(email, password) {
        if (!service) {
          return {
            message: 'Supabase is not configured for sign-in.',
            success: false as const,
          };
        }
        const result = await service.signIn(email, password);
        if (result.success) {
          setSession(result.session);
          setStatus('authenticated');
        }
        return result;
      },
      async signOut() {
        if (!service) {
          return {
            message: 'There is no active session to sign out.',
            success: false as const,
          };
        }
        const result = await service.signOut();
        if (result.success) {
          setSession(null);
          setStatus('unauthenticated');
        }
        return result;
      },
      status,
    }),
    [service, session, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
}
