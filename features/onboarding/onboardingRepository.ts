// Server boundary for onboarding. Mirrors lib/auth/authService.ts: a narrow
// interface (OnboardingBackend) keeps the repository testable, and a Supabase
// adapter implements it against the RLS-protected owner-scoped tables.
//
// Server authority (docs/04 §4.2): the client proposes the profile; RLS
// (auth.uid() = user_id) enforces that a user can only write their own rows.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/supabase';

import {
  buildOnboardingSubmission,
  type BuildSubmissionInput,
  type OnboardingSubmission,
} from './onboardingSubmission';

type BackendError = { message: string } | null;

export type OnboardingBackend = {
  getCompletedAt(
    userId: string,
  ): Promise<{ data: string | null; error: BackendError }>;
  persist(submission: OnboardingSubmission): Promise<{ error: BackendError }>;
};

export type FetchStatusResult =
  { completed: boolean; success: true } | { message: string; success: false };

export type SubmitResult =
  { success: true } | { message: string; success: false };

export function createSupabaseOnboardingBackend(
  client: SupabaseClient<Database>,
): OnboardingBackend {
  return {
    async getCompletedAt(userId) {
      const { data, error } = await client
        .from('profiles')
        .select('onboarding_completed_at')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) {
        return { data: null, error };
      }
      return { data: data?.onboarding_completed_at ?? null, error: null };
    },

    async persist(submission) {
      const profile = await client
        .from('profiles')
        .upsert(submission.profile, { onConflict: 'user_id' });
      if (profile.error) {
        return { error: profile.error };
      }
      const goals = await client.from('goals').insert(submission.goals);
      if (goals.error) {
        return { error: goals.error };
      }
      const health = await client
        .from('health_context')
        .insert(submission.healthContext);
      if (health.error) {
        return { error: health.error };
      }
      return { error: null };
    },
  };
}

export function createOnboardingRepository(backend: OnboardingBackend) {
  return {
    async fetchStatus(userId: string): Promise<FetchStatusResult> {
      const { data, error } = await backend.getCompletedAt(userId);
      if (error) {
        return {
          message: 'We could not check your setup status.',
          success: false,
        };
      }
      return { completed: data !== null, success: true };
    },

    async submit(input: BuildSubmissionInput): Promise<SubmitResult> {
      const { error } = await backend.persist(buildOnboardingSubmission(input));
      if (error) {
        return {
          message:
            'We could not save your setup. Check your connection and try again.',
          success: false,
        };
      }
      return { success: true };
    },
  };
}

export type OnboardingRepository = ReturnType<
  typeof createOnboardingRepository
>;
