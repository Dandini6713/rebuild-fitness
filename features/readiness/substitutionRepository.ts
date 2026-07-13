// Server boundary for the amber activity substitution (roadmap 15, docs/06 §6.2).
// Mirrors readinessRepository / planRepository: a narrow backend interface keeps the
// composition testable, and a Supabase adapter implements it.
//
// The substitution is a LINKED replacement written ATOMICALLY by the trusted
// substitute_session RPC (a SECURITY INVOKER transactional function): it marks the
// original 'replaced' and inserts a new session pointing back at it, in one
// transaction. The client never does the two writes itself, so it can never half-fail
// and orphan a 'replaced' session. Unlike the red block (roadmap 14), this needs no
// server ENFORCEMENT — the user owns every row and RLS applies — it is an action the
// user opts into.
//
// Offline is an HONEST failure here, not a local hold. The swap is server-side (the
// replacement id comes back from the RPC), so there is nothing meaningful to show while
// offline; the UI says "we could not swap the session, try again when back online"
// rather than pretending the swap happened.

import type { SupabaseClient } from '@supabase/supabase-js';

import type { SubstitutionSessionType } from '@/domain/training/activitySubstitution';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// Exactly what substitute_session accepts. The specific chosen activity is already
// folded into `reason` (a walk/bike/cross-trainer all store as 'cardio'); the RPC
// enforces that the original is a currently-active gated session and that no second
// replacement can be created.
export type SubstitutionRequest = {
  originalSessionId: string;
  newType: SubstitutionSessionType;
  newTemplateId: string | null;
  reason: string;
  // The amber result asks for a next-morning check (docs/06 §6.2); recorded on the
  // replacement so the app can later surface it (the reminder itself is roadmap 24).
  expectNextMorningCheck: boolean;
};

export type SubstitutionBackend = {
  substitute(
    request: SubstitutionRequest,
  ): Promise<{ data: string | null; error: BackendError }>;
};

export type SubstituteResult =
  // The RPC swapped the session and returned the new replacement id.
  | { status: 'substituted'; newSessionId: string }
  // The request could not reach the server. The swap is server-side, so nothing
  // changed; the user is told to try again when back online.
  | { status: 'offline' }
  | { status: 'error'; message: string };

const SUBSTITUTE_ERROR = 'We could not swap the session. Please try again.';

// A network-shaped failure means the request never reached the server, so no swap
// happened. Anything else is a real error to surface.
function looksOffline(error: { message?: string } | null): boolean {
  const message = (error?.message ?? '').toLowerCase();
  return (
    message.includes('network') ||
    message.includes('fetch') ||
    message.includes('failed to fetch') ||
    message.includes('offline') ||
    message.includes('timeout')
  );
}

export function createSupabaseSubstitutionBackend(
  client: SupabaseClient<Database>,
): SubstitutionBackend {
  return {
    async substitute(request) {
      type Args = Database['public']['Functions']['substitute_session']['Args'];
      // Optional keys are omitted rather than passed as undefined so the SQL defaults
      // apply (exactOptionalPropertyTypes).
      const params: Args = {
        p_expect_next_morning_check: request.expectNextMorningCheck,
        p_new_type: request.newType,
        p_original_session_id: request.originalSessionId,
        p_reason: request.reason,
      };
      if (request.newTemplateId) {
        params.p_new_template_id = request.newTemplateId;
      }
      const { data, error } = await client.rpc('substitute_session', params);
      if (error) {
        return { data: null, error };
      }
      return { data: typeof data === 'string' ? data : null, error: null };
    },
  };
}

export function createSubstitutionRepository(backend: SubstitutionBackend) {
  return {
    async substitute(request: SubstitutionRequest): Promise<SubstituteResult> {
      const { data, error } = await backend.substitute(request);
      if (error) {
        if (looksOffline(error)) {
          return { status: 'offline' };
        }
        return { message: error.message || SUBSTITUTE_ERROR, status: 'error' };
      }
      if (!data) {
        return { message: SUBSTITUTE_ERROR, status: 'error' };
      }
      return { newSessionId: data, status: 'substituted' };
    },
  };
}

export type SubstitutionRepository = ReturnType<
  typeof createSubstitutionRepository
>;
