import { AuthChangeEvent, Session } from '@supabase/supabase-js';

export type SupabaseAuthBoundary = {
  getSession(): Promise<{
    data: { session: Session | null };
    error: { message: string } | null;
  }>;
  onAuthStateChange(
    callback: (event: AuthChangeEvent, session: Session | null) => void,
  ): { data: { subscription: { unsubscribe(): void } } };
  signInWithPassword(credentials: {
    email: string;
    password: string;
  }): Promise<{
    data: { session: Session | null };
    error: { message: string } | null;
  }>;
  signOut(options: {
    scope: 'local';
  }): Promise<{ error: { message: string } | null }>;
};

export type AuthService = ReturnType<typeof createAuthService>;

export function createAuthService(auth: SupabaseAuthBoundary) {
  return {
    async getSession() {
      const { data, error } = await auth.getSession();
      return error ? { session: null } : { session: data.session };
    },

    subscribe(callback: (session: Session | null) => void) {
      const { data } = auth.onAuthStateChange((_event, session) =>
        callback(session),
      );
      return () => data.subscription.unsubscribe();
    },

    async signIn(email: string, password: string) {
      const { data, error } = await auth.signInWithPassword({
        email,
        password,
      });
      if (error || !data.session) {
        return {
          message:
            'We could not sign you in. Check your details and try again.',
          success: false as const,
        };
      }
      return { session: data.session, success: true as const };
    },

    async signOut() {
      const { error } = await auth.signOut({ scope: 'local' });
      return error
        ? {
            message:
              'We could not sign you out. Check your connection and try again.',
            success: false as const,
          }
        : { success: true as const };
    },
  };
}
