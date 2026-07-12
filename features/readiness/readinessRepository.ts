// Server boundary for the readiness forms (roadmap 13, docs/03 S-011/S-015). Mirrors
// features/today and features/plan: a narrow backend interface keeps the composition
// testable, and a Supabase adapter implements it.
//
// The crux of this feature (docs/06 §6.1): the client submits RAW ANSWERS ONLY and
// never a classification. The trusted security-definer RPC submit_readiness_checkin
// re-computes the classification server-side and returns it. There is deliberately no
// path here that writes a classification — the backend interface has no such field,
// and readiness_checkins has no client INSERT grant (20260711090500), so a direct
// insert is impossible even if one were attempted.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  classifyReadiness,
  type ReadinessClassification,
  type ReadinessDecision,
  type ReadinessReason,
} from '@/domain/training/readinessClassification';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// Exactly the raw answers the RPC accepts — no classification, ever.
export type ReadinessSubmission = {
  checkinType: 'pre_session' | 'post_session' | 'next_morning';
  painScore: number;
  stiffnessChange: string;
  swellingLevel: string;
  walkingStatus: string;
  suddenChange: boolean;
  confidenceScore: number;
  scheduledSessionId: string | null;
  sessionEffort: number | null;
  notes: string | null;
  previousNextMorningIncrease: boolean;
  cannotBearWeight: boolean;
};

// What the server returns: the classification it computed, the rule version it used
// and the structured reasons it recorded. The client trusts these, not its own.
export type ServerReadinessResult = {
  id: string;
  classification: ReadinessClassification;
  ruleVersion: string;
  reasons: ReadinessReason[];
};

export type ReadinessBackend = {
  submit(
    submission: ReadinessSubmission,
  ): Promise<{ data: ServerReadinessResult | null; error: BackendError }>;
};

export type SubmitResult =
  // The server classified and stored the check-in.
  | { status: 'classified'; result: ServerReadinessResult }
  // The submission could not reach the server (offline or a transient failure). The
  // answers are held on the device for replay; a provisional local classification
  // (the same pure rules, not yet stored) is offered so a red flag is never hidden.
  | { status: 'held'; provisional: ReadinessDecision }
  | { status: 'error'; message: string };

const SUBMIT_ERROR =
  'We could not submit your readiness check. Please try again.';

// A network-shaped failure means the request never reached the server, so the answers
// are safe to hold and replay. Anything else is a real error the user should retry.
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

export function createSupabaseReadinessBackend(
  client: SupabaseClient<Database>,
): ReadinessBackend {
  return {
    async submit(submission) {
      // Only raw answers — never a classification. Optional keys are omitted rather
      // than passed as undefined so the SQL defaults apply (exactOptionalPropertyTypes).
      type Args =
        Database['public']['Functions']['submit_readiness_checkin']['Args'];
      const params: Args = {
        p_cannot_bear_weight: submission.cannotBearWeight,
        p_checkin_type: submission.checkinType,
        p_confidence_score: submission.confidenceScore,
        p_pain_score: submission.painScore,
        p_previous_next_morning_increase:
          submission.previousNextMorningIncrease,
        p_stiffness_change: submission.stiffnessChange,
        p_sudden_change: submission.suddenChange,
        p_swelling_level: submission.swellingLevel,
        p_walking_status: submission.walkingStatus,
      };
      if (submission.scheduledSessionId) {
        params.p_scheduled_session_id = submission.scheduledSessionId;
      }
      if (submission.sessionEffort !== null) {
        params.p_session_effort = submission.sessionEffort;
      }
      if (submission.notes) {
        params.p_notes = submission.notes;
      }
      const { data, error } = await client.rpc(
        'submit_readiness_checkin',
        params,
      );
      if (error) {
        return { data: null, error };
      }
      // The RPC returns a single-row set.
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) {
        return { data: null, error: { message: SUBMIT_ERROR } };
      }
      return {
        data: {
          classification: row.classification,
          id: row.id,
          reasons: Array.isArray(row.trigger_reasons)
            ? (row.trigger_reasons as unknown as ReadinessReason[])
            : [],
          ruleVersion: row.rule_version,
        },
        error: null,
      };
    },
  };
}

// A provisional, display-only classification from the SAME pure rules, for the offline
// case. It is clearly marked provisional in the UI and is never stored — the stored
// classification is always the server's.
function provisionalDecision(
  submission: ReadinessSubmission,
): ReadinessDecision {
  return classifyReadiness({
    cannotBearWeight: submission.cannotBearWeight,
    confidenceScore: submission.confidenceScore,
    painScore: submission.painScore,
    previousNextMorningIncrease: submission.previousNextMorningIncrease,
    stiffnessChange:
      submission.stiffnessChange as ReadinessDecision['inputs']['stiffnessChange'],
    suddenChange: submission.suddenChange,
    swellingLevel:
      submission.swellingLevel as ReadinessDecision['inputs']['swellingLevel'],
    walkingStatus:
      submission.walkingStatus as ReadinessDecision['inputs']['walkingStatus'],
  });
}

export function createReadinessRepository(backend: ReadinessBackend) {
  return {
    async submit(submission: ReadinessSubmission): Promise<SubmitResult> {
      const { data, error } = await backend.submit(submission);
      if (error) {
        if (looksOffline(error)) {
          return {
            provisional: provisionalDecision(submission),
            status: 'held',
          };
        }
        return { message: error.message || SUBMIT_ERROR, status: 'error' };
      }
      if (!data) {
        return { message: SUBMIT_ERROR, status: 'error' };
      }
      return { result: data, status: 'classified' };
    },
  };
}

export type ReadinessRepository = ReturnType<typeof createReadinessRepository>;
