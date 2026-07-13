// Server boundary for the running progression surface (roadmap 17, docs/06 §6.3).
// Mirrors features/workouts and features/cardio: a narrow backend interface keeps
// the composition testable, and a Supabase adapter implements it against the
// RLS-protected, owner-scoped tables. Every read and write only ever touches the
// caller's own rows because RLS enforces auth.uid() = user_id.
//
// This parallels the strength progression pattern (features/workouts): a pure engine
// (domain/training/runningProgression.ts) PROPOSES, and one row is stored in
// running_progression_proposals. The engine never applies; a proposal starts
// 'proposed' and the user's explicit acceptance ('Confirm and advance') records
// their readiness to progress (docs/06 §6.3) and stamps 'accepted'.
//
// How confirmation is modelled. docs/06 §6.3 requires the user's explicit
// confirmation to advance. That confirmation is the ACCEPT action on the proposal:
// evaluation produces the proposal (passing userConfirmedReadiness = true so an
// objectively-eligible stage yields an 'advance' PROPOSAL to confirm), and nothing
// moves until the user accepts it. The proposed → accepted lifecycle IS the
// confirmation gate. The engine's confirmation input still exists and is tested with
// both values, protecting the contract for any future non-accepting caller.
//
// Stage application is a DECLARED SEAM. Accepting an advance records the decision but
// does NOT move the stage the player plays: the base plan does not yet link a
// scheduled cardio session to a stage (the roadmap 16 seam — the player always plays
// the lowest available stage), so applying an accepted advance to the forward
// schedule is heavier than a small change and is deferred. See CLAUDE.md.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  evaluateRunningProgression,
  evaluateSameWeekVolumeWarning,
  type ProgressionReason,
  type ReadinessResponse,
  type RunningDecisionCode,
} from '@/domain/training/runningProgression';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// --- Backend interface (flat rows; the adapter flattens Supabase's shapes) -----

type RawCurrentStage = {
  templateId: string;
  templateName: string;
  stageNumber: number;
  requiredSessions: number;
  // The plan week the most recent completed session at this stage sits in, so the
  // same-week volume warning can key on it. Null when nothing is completed yet.
  planWeekId: string | null;
};

type RawStageSessions = {
  efforts: (number | null)[];
  scheduledSessionIds: string[];
};

type RawStoredProposal = {
  id: string;
  decision: RunningDecisionCode;
  fromStageNumber: number;
  toStageNumber: number;
  planWeekId: string | null;
  reasons: ProgressionReason[];
};

export type RunningProposalRow = {
  userId: string;
  fromStageNumber: number;
  toStageNumber: number;
  planWeekId: string | null;
  decision: RunningDecisionCode;
  reasons: ProgressionReason[];
  inputs: unknown;
  ruleVersion: string;
};

export type RunningProgressionBackend = {
  // The newest still-'proposed' running proposal, or null when none is pending.
  fetchLatestProposal(
    userId: string,
  ): Promise<{ data: RawStoredProposal | null; error: BackendError }>;
  // The stage the user is currently on: the staged template of their most recent
  // completed cardio session, or the lowest stage when nothing is completed yet.
  fetchCurrentStage(
    userId: string,
  ): Promise<{ data: RawCurrentStage | null; error: BackendError }>;
  fetchStageSessions(input: {
    userId: string;
    templateId: string;
  }): Promise<{ data: RawStageSessions | null; error: BackendError }>;
  fetchReadiness(input: {
    userId: string;
    scheduledSessionIds: string[];
  }): Promise<{ data: ReadinessResponse[] | null; error: BackendError }>;
  insertProposal(
    row: RunningProposalRow,
  ): Promise<{ data: { id: string } | null; error: BackendError }>;
  // Whether an accepted lower-body strength increase lands in the same plan week
  // (docs/06 §6.5). Feeds the now-live evaluateVolumeIncrease predicate.
  fetchLowerBodyIncreaseInWeek(input: {
    userId: string;
    planWeekId: string;
  }): Promise<{ data: boolean; error: BackendError }>;
  decideProposal(input: {
    proposalId: string;
    userId: string;
    status: 'accepted' | 'dismissed';
    decidedAtIso: string;
  }): Promise<{ error: BackendError }>;
};

// --- Read model ---------------------------------------------------------------

export type RunningProposalView = {
  id: string;
  decision: RunningDecisionCode;
  fromStageNumber: number;
  toStageNumber: number;
  recommendation: string;
  reasons: ProgressionReason[];
  nextAction: string;
  // The soft same-week volume warning (docs/06 §6.5), shown alongside an advance
  // proposal. Null unless a running advance coincides with an accepted lower-body
  // increase in the same plan week. Never a block — the user may still proceed.
  volumeWarning: string | null;
};

export type RunningLoadResult =
  | { status: 'ready'; proposal: RunningProposalView }
  // A cardio session exists, but the user has no run-walk stage library seeded yet.
  | { status: 'no-programme' }
  | { status: 'error'; message: string };

const READ_ERROR =
  'We could not check your running progression. Check your connection and try again.';

// Rebuild the surfaced recommendation/next-action copy from a stored decision. A
// stored proposal keeps its reasons; re-deriving the sentence copy from the engine
// keeps one source of wording and avoids persisting long strings twice.
function stageLabel(stageNumber: number): string {
  return `stage ${stageNumber}`;
}

export function createRunningProgressionRepository(deps: {
  backend: RunningProgressionBackend;
}) {
  const { backend } = deps;

  // Compute the same-week volume warning for a proposal: only an advance with an
  // accepted lower-body increase in the same plan week warns. Best-effort — any
  // error simply yields no warning rather than failing the surface.
  async function volumeWarningFor(input: {
    userId: string;
    decision: RunningDecisionCode;
    planWeekId: string | null;
  }): Promise<string | null> {
    if (input.decision !== 'advance' || !input.planWeekId) {
      return null;
    }
    const lower = await backend.fetchLowerBodyIncreaseInWeek({
      planWeekId: input.planWeekId,
      userId: input.userId,
    });
    if (lower.error) {
      return null;
    }
    const conflict = evaluateSameWeekVolumeWarning({
      decision: input.decision,
      lowerBodyVolumeIncreased: lower.data,
    });
    return conflict?.message ?? null;
  }

  return {
    async loadProposal(input: {
      userId: string;
      nowIso: string;
    }): Promise<RunningLoadResult> {
      // Surface an existing pending proposal first, so the screen is stable across
      // reopens and does not create a fresh row every visit.
      const existing = await backend.fetchLatestProposal(input.userId);
      if (existing.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      if (existing.data) {
        const stored = existing.data;
        const warning = await volumeWarningFor({
          decision: stored.decision,
          planWeekId: stored.planWeekId,
          userId: input.userId,
        });
        return {
          proposal: viewFromStored(stored, warning),
          status: 'ready',
        };
      }

      // No pending proposal: evaluate the current stage now and store one.
      const stageResult = await backend.fetchCurrentStage(input.userId);
      if (stageResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const stage = stageResult.data;
      if (!stage) {
        return { status: 'no-programme' };
      }

      const sessionsResult = await backend.fetchStageSessions({
        templateId: stage.templateId,
        userId: input.userId,
      });
      if (sessionsResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const sessions = sessionsResult.data ?? {
        efforts: [],
        scheduledSessionIds: [],
      };

      const readinessResult = await backend.fetchReadiness({
        scheduledSessionIds: sessions.scheduledSessionIds,
        userId: input.userId,
      });
      if (readinessResult.error) {
        return { message: READ_ERROR, status: 'error' };
      }

      const decision = evaluateRunningProgression(
        {
          requiredSessions: stage.requiredSessions,
          stageNumber: stage.stageNumber,
        },
        {
          completedSessions: sessions.efforts.length,
          efforts: sessions.efforts,
          readiness: readinessResult.data ?? [],
          // The accept action is the user's readiness confirmation (see header).
          userConfirmedReadiness: true,
        },
      );

      const inserted = await backend.insertProposal({
        decision: decision.decision,
        fromStageNumber: decision.fromStageNumber,
        inputs: decision.inputs,
        planWeekId: stage.planWeekId,
        reasons: decision.reasons,
        ruleVersion: decision.ruleVersion,
        toStageNumber: decision.toStageNumber,
        userId: input.userId,
      });
      if (inserted.error || !inserted.data) {
        return { message: READ_ERROR, status: 'error' };
      }

      const warning = await volumeWarningFor({
        decision: decision.decision,
        planWeekId: stage.planWeekId,
        userId: input.userId,
      });

      return {
        proposal: {
          decision: decision.decision,
          fromStageNumber: decision.fromStageNumber,
          id: inserted.data.id,
          nextAction: decision.nextAction,
          reasons: decision.reasons,
          recommendation: decision.recommendation,
          toStageNumber: decision.toStageNumber,
          volumeWarning: warning,
        },
        status: 'ready',
      };
    },

    // Record the user's explicit decision. Accepting is their confirmation of
    // readiness to progress (docs/06 §6.3); dismissing sets it aside. Both stamp
    // decided_at, and only 'proposed' rows are ever fetched, so a decided proposal
    // never reappears. Applying an accepted advance to the schedule is a seam.
    async decideProposal(decision: {
      proposalId: string;
      userId: string;
      status: 'accepted' | 'dismissed';
      decidedAtIso: string;
    }): Promise<{ ok: boolean }> {
      const { error } = await backend.decideProposal(decision);
      return { ok: !error };
    },
  };
}

// A stored proposal keeps its decision, stages and reasons; the recommendation and
// next-action sentences are re-derived so the wording has one source.
function viewFromStored(
  stored: RawStoredProposal,
  volumeWarning: string | null,
): RunningProposalView {
  return {
    decision: stored.decision,
    fromStageNumber: stored.fromStageNumber,
    id: stored.id,
    nextAction: nextActionFor(stored),
    reasons: stored.reasons,
    recommendation: recommendationFor(stored),
    toStageNumber: stored.toStageNumber,
    volumeWarning,
  };
}

function recommendationFor(stored: RawStoredProposal): string {
  switch (stored.decision) {
    case 'advance':
      return `You have met everything needed to progress. When you are ready, you could move up to ${stageLabel(
        stored.toStageNumber,
      )}.`;
    case 'regress':
      return 'It looks best to ease back a stage for now rather than progressing.';
    case 'pause':
      return 'Progression is paused at this stage while you take a break — you can pick it up again whenever you are ready.';
    case 'repeat':
    default:
      return 'Repeat this stage next time rather than moving up — there is no rush.';
  }
}

function nextActionFor(stored: RawStoredProposal): string {
  switch (stored.decision) {
    case 'advance':
      return `Confirm when you are ready to progress, and ${stageLabel(
        stored.toStageNumber,
      )} will be suggested for your next runs.`;
    case 'regress':
      return `Repeat ${stageLabel(
        stored.toStageNumber,
      )} next time, and record a readiness check before your next run.`;
    case 'pause':
      return 'Resume whenever you are ready; the stage will be waiting where you left it.';
    case 'repeat':
    default:
      return 'Repeat this stage and record a readiness check before each run.';
  }
}

export type RunningProgressionRepository = ReturnType<
  typeof createRunningProgressionRepository
>;

// --- Supabase adapter ---------------------------------------------------------

type NestedCompletedLogRow = {
  session_effort: number | null;
  completed_at: string | null;
  scheduled_session_id: string | null;
  cardio_template_id: string | null;
  scheduled_sessions: { plan_week_id: string | null } | null;
  cardio_templates: {
    id: string;
    name: string;
    stage_number: number | null;
    required_sessions: number;
  } | null;
};

export function createSupabaseRunningProgressionBackend(
  client: SupabaseClient<Database>,
): RunningProgressionBackend {
  return {
    async fetchLatestProposal(userId) {
      const { data, error } = await client
        .from('running_progression_proposals')
        .select(
          'id, decision, from_stage_number, to_stage_number, plan_week_id, reasons',
        )
        .eq('user_id', userId)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) {
        return { data: null, error };
      }
      if (!data) {
        return { data: null, error: null };
      }
      return {
        data: {
          decision: data.decision as RunningDecisionCode,
          fromStageNumber: data.from_stage_number,
          id: data.id,
          planWeekId: data.plan_week_id,
          reasons: (data.reasons as ProgressionReason[] | null) ?? [],
          toStageNumber: data.to_stage_number,
        },
        error: null,
      };
    },

    async fetchCurrentStage(userId) {
      // The most recent completed cardio session on a staged template tells us the
      // stage the user is on. When nothing is completed yet, fall back to the lowest
      // seeded stage so the surface still explains where they will begin.
      const completed = await client
        .from('cardio_logs')
        .select(
          'session_effort, completed_at, scheduled_session_id, cardio_template_id, scheduled_sessions(plan_week_id), cardio_templates!inner(id, name, stage_number, required_sessions)',
        )
        .eq('user_id', userId)
        .eq('status', 'completed')
        .not('cardio_templates.stage_number', 'is', null)
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (completed.error) {
        return { data: null, error: completed.error };
      }
      const row = completed.data as unknown as NestedCompletedLogRow | null;
      if (row?.cardio_templates && row.cardio_templates.stage_number !== null) {
        return {
          data: {
            planWeekId: row.scheduled_sessions?.plan_week_id ?? null,
            requiredSessions: row.cardio_templates.required_sessions,
            stageNumber: row.cardio_templates.stage_number,
            templateId: row.cardio_templates.id,
            templateName: row.cardio_templates.name,
          },
          error: null,
        };
      }

      const lowest = await client
        .from('cardio_templates')
        .select('id, name, stage_number, required_sessions')
        .eq('user_id', userId)
        .not('stage_number', 'is', null)
        .order('stage_number', { ascending: true })
        .limit(1)
        .maybeSingle();
      if (lowest.error) {
        return { data: null, error: lowest.error };
      }
      if (!lowest.data || lowest.data.stage_number === null) {
        return { data: null, error: null };
      }
      return {
        data: {
          planWeekId: null,
          requiredSessions: lowest.data.required_sessions,
          stageNumber: lowest.data.stage_number,
          templateId: lowest.data.id,
          templateName: lowest.data.name,
        },
        error: null,
      };
    },

    async fetchStageSessions({ templateId, userId }) {
      const { data, error } = await client
        .from('cardio_logs')
        .select('session_effort, scheduled_session_id')
        .eq('user_id', userId)
        .eq('cardio_template_id', templateId)
        .eq('status', 'completed')
        .order('completed_at', { ascending: false });
      if (error) {
        return { data: null, error };
      }
      const rows = data ?? [];
      return {
        data: {
          efforts: rows.map((row) => row.session_effort),
          scheduledSessionIds: rows
            .map((row) => row.scheduled_session_id)
            .filter((id): id is string => id !== null),
        },
        error: null,
      };
    },

    async fetchReadiness({ scheduledSessionIds, userId }) {
      if (scheduledSessionIds.length === 0) {
        return { data: [], error: null };
      }
      const { data, error } = await client
        .from('readiness_checkins')
        .select('checkin_type, classification, walking_status')
        .eq('user_id', userId)
        .in('scheduled_session_id', scheduledSessionIds);
      if (error) {
        return { data: null, error };
      }
      return {
        data: (data ?? []).map((row) => ({
          level: row.classification as ReadinessResponse['level'],
          phase: row.checkin_type as ReadinessResponse['phase'],
          walkingAltered: row.walking_status === 'altered',
        })),
        error: null,
      };
    },

    async insertProposal(row) {
      type ProposalInsert =
        Database['public']['Tables']['running_progression_proposals']['Insert'];
      const { data, error } = await client
        .from('running_progression_proposals')
        .insert({
          decision: row.decision,
          from_stage_number: row.fromStageNumber,
          inputs: row.inputs as NonNullable<ProposalInsert['inputs']>,
          plan_week_id: row.planWeekId,
          reasons: row.reasons as unknown as NonNullable<
            ProposalInsert['reasons']
          >,
          rule_version: row.ruleVersion,
          to_stage_number: row.toStageNumber,
          user_id: row.userId,
        })
        .select('id')
        .single();
      if (error || !data) {
        return { data: null, error };
      }
      return { data: { id: data.id }, error: null };
    },

    async fetchLowerBodyIncreaseInWeek({ planWeekId, userId }) {
      // An accepted 'increase' strength proposal for a lower-body exercise whose
      // completing workout sits in this plan week. Joins the proposal → its workout
      // log → scheduled session (plan week) and → the exercise (body region).
      const { data, error } = await client
        .from('progression_proposals')
        .select(
          'id, workout_logs!inner(scheduled_sessions!inner(plan_week_id)), exercises!inner(body_region)',
        )
        .eq('user_id', userId)
        .eq('status', 'accepted')
        .eq('decision', 'increase')
        .eq('workout_logs.scheduled_sessions.plan_week_id', planWeekId)
        .eq('exercises.body_region', 'lower_body')
        .limit(1);
      if (error) {
        return { data: false, error };
      }
      return { data: (data ?? []).length > 0, error: null };
    },

    async decideProposal({ decidedAtIso, proposalId, status, userId }) {
      const { error } = await client
        .from('running_progression_proposals')
        .update({ decided_at: decidedAtIso, status })
        .eq('id', proposalId)
        .eq('user_id', userId)
        .eq('status', 'proposed');
      return { error };
    },
  };
}
