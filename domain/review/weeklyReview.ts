// The weekly-review assembly (docs/05 §5.7, docs/06 §6.1/§6.7/§6.8/§6.10, docs/10 §10.3
// "Weekly review uses the correct effective nutrition target"; "Rule version is stored with
// classifications and adjustments"). A pure function with no React and no I/O: it takes the
// week's already-computed pieces — adherence, the protein report, the weight trend, the
// alcohol summary, the calorie decision, and the strength/running progression proposals —
// and SHAPES the metrics + recommendations object that persists to weekly_reviews (jsonb).
//
// It computes no new rules. The calorie decision comes from calorieAdjustment.ts; the
// strength/running recommendations are SURFACED from the stored proposals the roadmap-12/17
// engines produced (READ, not re-run — this roadmap presents them in the review). Every
// recommendation carries its EVIDENCE (the engine inputs) and its RULE VERSION, so a stored
// review is a faithful, auditable record of what was recommended and why (docs/06 §6.1/§6.10).
//
// Nothing is applied here. A calorie proposal is accept-not-auto, exactly like the
// strength/running proposals, so acceptance is modelled in the data shape (a status per
// recommendation and an accepted-changes slot on the row) for the roadmap-23 interface to
// drive; the assembly itself only proposes.

import type { WeeklyAlcoholSummary } from '@/domain/alcohol/alcoholUnits';
import type { WeightTrendResult } from '@/domain/measurements/weightTrend';
import type { CalorieAdjustmentDecision } from '@/domain/nutrition/calorieAdjustment';
import type { ProteinReport } from '@/domain/nutrition/proteinReport';
import type { WeeklyAdherence } from '@/domain/training/todaySession';

// The assembly's own version, distinct from each engine's rule version (docs/06 §6.10). A
// change to how the review is shaped bumps this; the per-recommendation rule versions track
// the engines.
export const RULE_VERSION = 'weekly-review/v1';

// A structured reason, shared shape across the calorie and progression engines.
export type ReviewReason = { code: string; message: string };

export type ReviewRecommendationSource = 'calorie' | 'strength' | 'running';

// The CONCRETE calorie change a proposal would apply, stored on the recommendation so the
// confirm path applies exactly what was proposed (roadmap 23). The RPC that applies an
// accepted change reads `proposedTargetCalories` from this stored value, NOT from a client
// parameter, so the applied target is always faithful to the engine's decision and the
// audit trail is honest. Present only on an actionable calorie recommendation.
export type CalorieProposedChange = {
  proposedTargetCalories: number;
  deltaKcal: number;
  professionalReviewRequired: boolean;
};

// One recommendation in the review. `actionable` is true when there is a concrete change the
// user could accept (a calorie proposal, a strength increase, a running advance); `status`
// tracks its lifecycle — 'proposed' when actionable and awaiting a decision, 'accepted' /
// 'dismissed' once decided (carried through from a stored proposal), or 'none' for a purely
// informational item (no-change / not-eligible). `evidence` is the engine's inputs and
// `ruleVersion` is that engine's version — both stored for the audit trail.
//
// `proposalId` is the underlying progression_proposals / running_progression_proposals row
// the confirm path marks accepted/dismissed (strength/running only — a calorie change has
// no separate proposal row, it applies a new nutrition_targets row). `change` is the
// concrete calorie change (calorie only). Both are what roadmap 23's confirm flow targets.
export type WeeklyReviewRecommendation = {
  source: ReviewRecommendationSource;
  decision: string;
  actionable: boolean;
  status: 'proposed' | 'accepted' | 'dismissed' | 'none';
  summary: string;
  reasons: ReviewReason[];
  evidence: unknown;
  ruleVersion: string;
  proposalId?: string;
  change?: CalorieProposedChange;
};

// The week's metric snapshot. Each series is the honest output of its engine — a null where
// there is no basis for a value (adherence with nothing planned; an insufficient weight
// trend), never a fabricated zero.
export type WeeklyReviewMetrics = {
  periodStart: string;
  periodEnd: string;
  adherence: {
    completed: number;
    planned: number;
    percent: number | null;
  };
  protein: ProteinReport;
  weightTrend: {
    status: WeightTrendResult['status'];
    trendKg: number | null;
    changePerWeekKg: number | null;
    direction: string | null;
  };
  alcohol: WeeklyAlcoholSummary;
};

export type WeeklyReview = {
  metrics: WeeklyReviewMetrics;
  recommendations: WeeklyReviewRecommendation[];
  ruleVersion: string;
};

// A stored progression proposal as the review surfaces it (READ from
// progression_proposals / running_progression_proposals; NOT re-run here). Its own status
// and rule version travel with it into the review.
export type SurfacedProposal = {
  // The progression_proposals / running_progression_proposals row id, so the confirm path
  // can mark the right row accepted/dismissed. Optional for the pure assembler's contract
  // (a caller may present a proposal with no row behind it), but generation always supplies
  // it so the surfaced recommendation is actionable end to end.
  proposalId?: string;
  decision: string;
  summary: string;
  reasons: ReviewReason[];
  evidence: unknown;
  ruleVersion: string;
  status: 'proposed' | 'accepted' | 'dismissed';
};

export type AssembleWeeklyReviewInput = {
  period: { start: string; end: string };
  adherence: WeeklyAdherence;
  proteinReport: ProteinReport;
  weightTrend: WeightTrendResult;
  alcohol: WeeklyAlcoholSummary;
  calorie: CalorieAdjustmentDecision;
  // Surfaced strength proposals for the week (READ, not re-run). Usually the newest per
  // exercise; the assembler simply presents whatever it is given.
  strengthProposals?: readonly SurfacedProposal[];
  // The surfaced running proposal for the week, or null when there is none.
  runningProposal?: SurfacedProposal | null;
};

// A short British-English summary line for the calorie recommendation, keyed to its decision
// code. The full reasoning is in `reasons`; this is the headline the review lists.
function calorieSummary(calorie: CalorieAdjustmentDecision): string {
  switch (calorie.decision) {
    case 'propose-reduction':
      return calorie.professionalReviewRequired
        ? `Suggested reduction to about ${calorie.proposedTargetCalories} kcal a day, held at your safety floor.`
        : `Suggested reduction to about ${calorie.proposedTargetCalories} kcal a day.`;
    case 'propose-increase':
      return `Suggested increase to about ${calorie.proposedTargetCalories} kcal a day (or review your logging).`;
    case 'no-change':
      return 'No calorie change suggested — your current target is on track.';
    case 'not-eligible':
    default:
      return 'No calorie change — there is not yet enough logged to suggest one.';
  }
}

// Assemble the week's review from its pieces (docs/05 §5.7). Pure: it reads only its inputs
// and returns the metrics + recommendations shape. It proposes nothing new — the calorie
// decision and the progression proposals are produced elsewhere and surfaced here.
export function assembleWeeklyReview(
  input: AssembleWeeklyReviewInput,
): WeeklyReview {
  const metrics: WeeklyReviewMetrics = {
    adherence: {
      completed: input.adherence.completed,
      percent: input.adherence.percent,
      planned: input.adherence.planned,
    },
    alcohol: input.alcohol,
    periodEnd: input.period.end,
    periodStart: input.period.start,
    protein: input.proteinReport,
    weightTrend: {
      changePerWeekKg:
        input.weightTrend.status === 'trend'
          ? input.weightTrend.changePerWeekKg
          : null,
      direction:
        input.weightTrend.status === 'trend'
          ? input.weightTrend.direction
          : null,
      status: input.weightTrend.status,
      trendKg:
        input.weightTrend.status === 'trend' ? input.weightTrend.trendKg : null,
    },
  };

  const recommendations: WeeklyReviewRecommendation[] = [];

  // Calorie recommendation — always present (informative even when no change), carrying its
  // evidence and rule version. Actionable only when it proposes a change.
  const calorieActionable =
    input.calorie.decision === 'propose-reduction' ||
    input.calorie.decision === 'propose-increase';
  // Attach the concrete change ONLY when the proposal is actionable and its numbers are
  // present, so the confirm path applies exactly what the engine proposed. A no-change /
  // not-eligible calorie item carries no change (nothing to apply).
  const calorieChange: CalorieProposedChange | null =
    calorieActionable &&
    input.calorie.proposedTargetCalories !== null &&
    input.calorie.deltaKcal !== null
      ? {
          deltaKcal: input.calorie.deltaKcal,
          professionalReviewRequired: input.calorie.professionalReviewRequired,
          proposedTargetCalories: input.calorie.proposedTargetCalories,
        }
      : null;
  recommendations.push({
    actionable: calorieActionable,
    decision: input.calorie.decision,
    evidence: input.calorie.inputs,
    reasons: input.calorie.reasons,
    ruleVersion: input.calorie.ruleVersion,
    source: 'calorie',
    status: calorieActionable ? 'proposed' : 'none',
    summary: calorieSummary(input.calorie),
    ...(calorieChange ? { change: calorieChange } : {}),
  });

  // Surfaced strength proposals (READ, not re-run). An 'increase' is actionable; a hold or
  // reduce/substitute is informational. The stored status travels through.
  for (const proposal of input.strengthProposals ?? []) {
    recommendations.push(
      surfacedRecommendation(
        'strength',
        proposal,
        proposal.decision === 'increase',
      ),
    );
  }

  // Surfaced running proposal (READ, not re-run). An 'advance' is actionable.
  if (input.runningProposal) {
    recommendations.push(
      surfacedRecommendation(
        'running',
        input.runningProposal,
        input.runningProposal.decision === 'advance',
      ),
    );
  }

  return {
    metrics,
    recommendations,
    ruleVersion: RULE_VERSION,
  };
}

// Map a stored progression proposal onto a review recommendation, preserving its evidence,
// rule version and decided status. An actionable, still-'proposed' item stays 'proposed';
// once the stored proposal is accepted/dismissed that status is what shows.
function surfacedRecommendation(
  source: ReviewRecommendationSource,
  proposal: SurfacedProposal,
  actionable: boolean,
): WeeklyReviewRecommendation {
  return {
    actionable: actionable && proposal.status === 'proposed',
    decision: proposal.decision,
    evidence: proposal.evidence,
    reasons: proposal.reasons,
    ruleVersion: proposal.ruleVersion,
    source,
    status: actionable ? proposal.status : 'none',
    summary: proposal.summary,
    ...(proposal.proposalId ? { proposalId: proposal.proposalId } : {}),
  };
}
