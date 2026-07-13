// The running progression rules from docs/06 §6.3, as small pure functions with no
// React and no I/O — the sibling of strengthProgression.ts (roadmap 12). From a
// stage's completed sessions, the readiness responses across
// them and whether the user has confirmed readiness, it returns advance / repeat /
// regress / pause with a recommendation, structured British-English reasons, the
// inputs used and the rule version. It never applies anything — it proposes. Roadmap
// 16 built the cardio PLAYER and seeded the nine run-walk stages; this engine decides
// whether to move between them.
//
// The engine proposes; it never writes and never applies. docs/06 §6.1 is explicit:
// a decision returns a code, a recommendation, human-readable reasons, the inputs
// used, the rule version and a suggested next action. Nothing here diagnoses,
// treats or assesses injury (docs/07): a readiness classification is a self-reported
// traffic light, "regress or pause" is a training suggestion, and there is no
// shame-based language.
//
// Fail safe. A missing signal can never satisfy the advance criteria. An absent or
// unknown readiness classification, an unrecorded effort, or a pre-session check the
// user was never asked to complete all fail the advance test — advancing a stage is
// only ever proposed on positive evidence. This mirrors the null handling in
// strengthProgression.ts.
//
// Precedence (docs/06 §6.3). The safety-most outcome wins: regress/pause outranks
// repeat outranks advance. A red response or altered walking after a session can
// never yield advance or repeat — it regresses. A single amber holds the stage
// (repeat); two ambers in the same stage regress. The user choosing to pause is a
// pause unless a safety trigger has already forced a regress.
//
// The stage-9 ceiling. Stage 9 is the top of the programme, so an advance from it is
// impossible: when every advance criterion is otherwise met at stage 9 the engine
// returns a clean "already at the final stage" repeat, never an advance to a stage
// that does not exist.

import type { SchedulingConflict } from './schedulingRules';
import { evaluateVolumeIncrease } from './schedulingRules';

export const RULE_VERSION = 'running-progression/v1';

// The top of the run-walk programme (docs/06 §6.3 lists nine stages). No advance
// is possible from here.
export const FINAL_STAGE_NUMBER = 9;

// The advance effort ceiling (docs/06 §6.3: "Average reported effort was no higher
// than 7 out of 10"). The repeat threshold is one higher: a single session at 8 or
// more repeats the stage.
const ADVANCE_AVERAGE_EFFORT_MAX = 7;
const REPEAT_EFFORT_MIN = 8;

export type ReadinessLevel = 'green' | 'amber' | 'red' | 'unclassifiable';

export type ReadinessPhase = 'pre_session' | 'post_session' | 'next_morning';

// One readiness response recorded around a session at this stage. `walkingAltered`
// captures "altered walking is reported after a session" (docs/06 §6.3), a regress
// trigger, and applies to post-session and next-morning responses.
// `resolvedBeforeNextSession` records whether a single amber had settled by the next
// session (docs/06 §6.3); it is kept for the audit trail and to phrase the repeat
// reason, but under precedence a single amber holds the stage regardless.
export type ReadinessResponse = {
  phase: ReadinessPhase;
  level: ReadinessLevel;
  walkingAltered?: boolean;
  resolvedBeforeNextSession?: boolean;
};

// The current stage's configuration, read from cardio_templates.
export type RunningStageConfig = {
  stageNumber: number;
  requiredSessions: number;
};

// Everything the rules read for one evaluation. `completedSessions` is the count of
// completed cardio sessions at this stage; `efforts` are their reported session
// efforts (0–10), each nullable because a session may not have recorded one.
export type RunningProgressionInput = {
  completedSessions: number;
  efforts: readonly (number | null)[];
  readiness: readonly ReadinessResponse[];
  // The user's explicit confirmation of readiness to progress (docs/06 §6.3). An
  // advance is never proposed without it; a missing confirmation is treated as
  // "not confirmed", never assumed.
  userConfirmedReadiness: boolean;
  // Optional self-reported signals. Absent means unknown and cannot, on its own,
  // force a repeat (userLacksConfidence) or a pause (userChoseToPause).
  userLacksConfidence?: boolean;
  userChoseToPause?: boolean;
};

export type RunningDecisionCode = 'advance' | 'repeat' | 'regress' | 'pause';

// A structured, human-readable reason: a stable code plus a plain British-English
// sentence. No shame-based language, and nothing implying diagnosis (docs/07).
export type ProgressionReason = {
  code: string;
  message: string;
};

// The inputs actually used to reach the decision (docs/06 §6.1), for the audit
// trail. JSON-serialisable, no undefined values.
export type RunningProgressionInputs = {
  fromStageNumber: number;
  requiredSessions: number;
  completedSessions: number;
  effortsProvided: number;
  effortsRecorded: number;
  averageEffort: number | null;
  maxEffort: number | null;
  preSessionCount: number;
  preSessionAllGreen: boolean;
  amberCount: number;
  redCount: number;
  alteredWalkingReported: boolean;
  userConfirmedReadiness: boolean;
  userLacksConfidence: boolean;
  userChoseToPause: boolean;
  isFinalStage: boolean;
};

// The §6.1 decision shape. `toStageNumber` is where the proposal would move the
// stage: +1 for advance, one lower (never below 1) for regress, unchanged for
// repeat and pause.
export type RunningProgressionDecision = {
  decision: RunningDecisionCode;
  fromStageNumber: number;
  toStageNumber: number;
  recommendation: string;
  reasons: ProgressionReason[];
  inputs: RunningProgressionInputs;
  ruleVersion: string;
  nextAction: string;
};

function isRecorded(value: number | null): value is number {
  return value !== null;
}

// Evaluate one stage's recent history and return a §6.3 decision. The engine only
// proposes; nothing here writes or applies.
export function evaluateRunningProgression(
  config: RunningStageConfig,
  input: RunningProgressionInput,
): RunningProgressionDecision {
  const fromStageNumber = config.stageNumber;
  const isFinalStage = fromStageNumber >= FINAL_STAGE_NUMBER;
  const userConfirmedReadiness = input.userConfirmedReadiness === true;
  const userLacksConfidence = input.userLacksConfidence === true;
  const userChoseToPause = input.userChoseToPause === true;

  const recordedEfforts = input.efforts.filter(isRecorded);
  const averageEffort =
    recordedEfforts.length === 0
      ? null
      : recordedEfforts.reduce((sum, value) => sum + value, 0) /
        recordedEfforts.length;
  const maxEffort =
    recordedEfforts.length === 0 ? null : Math.max(...recordedEfforts);
  const allEffortsRecorded =
    input.efforts.length > 0 && recordedEfforts.length === input.efforts.length;

  const preSessions = input.readiness.filter(
    (response) => response.phase === 'pre_session',
  );
  const preSessionAllGreen =
    preSessions.length >= config.requiredSessions &&
    preSessions.every((response) => response.level === 'green');

  const amberCount = input.readiness.filter(
    (response) => response.level === 'amber',
  ).length;
  const redCount = input.readiness.filter(
    (response) => response.level === 'red',
  ).length;
  const noRedPostOrNextMorning = !input.readiness.some(
    (response) =>
      response.level === 'red' &&
      (response.phase === 'post_session' || response.phase === 'next_morning'),
  );
  const alteredWalkingReported = input.readiness.some(
    (response) =>
      response.walkingAltered === true &&
      (response.phase === 'post_session' || response.phase === 'next_morning'),
  );

  const inputs: RunningProgressionInputs = {
    alteredWalkingReported,
    amberCount,
    averageEffort,
    completedSessions: input.completedSessions,
    effortsProvided: input.efforts.length,
    effortsRecorded: recordedEfforts.length,
    fromStageNumber,
    isFinalStage,
    maxEffort,
    preSessionAllGreen,
    preSessionCount: preSessions.length,
    redCount,
    requiredSessions: config.requiredSessions,
    userChoseToPause,
    userConfirmedReadiness,
    userLacksConfidence,
  };

  const build = (
    decision: RunningDecisionCode,
    toStageNumber: number,
    recommendation: string,
    reasons: ProgressionReason[],
    nextAction: string,
  ): RunningProgressionDecision => ({
    decision,
    fromStageNumber,
    inputs,
    nextAction,
    reasons,
    recommendation,
    ruleVersion: RULE_VERSION,
    toStageNumber,
  });

  const regressToStage = Math.max(1, fromStageNumber - 1);

  // --- Regress / pause: the safety-most outcome, evaluated first (docs/06 §6.3) ---
  // A red response, two ambers in the same stage, or altered walking after a
  // session regresses the stage; a red or altered-walking signal can never yield
  // advance or repeat.
  const regressReasons: ProgressionReason[] = [];
  if (redCount > 0) {
    regressReasons.push({
      code: 'red-response',
      message:
        'A red readiness result was recorded around this stage, so ease back a stage rather than progressing, and follow the readiness guidance.',
    });
  }
  if (amberCount >= 2) {
    regressReasons.push({
      code: 'two-amber-responses',
      message:
        'There were two amber readiness results at this stage, so ease back a stage to give things more time to settle.',
    });
  }
  if (alteredWalkingReported) {
    regressReasons.push({
      code: 'altered-walking',
      message:
        'Walking felt altered after a session, so ease back a stage rather than adding more running for now.',
    });
  }
  if (regressReasons.length > 0) {
    return build(
      'regress',
      regressToStage,
      'It looks best to ease back a stage for now rather than progressing.',
      regressReasons,
      fromStageNumber > 1
        ? `Repeat stage ${regressToStage} next time, and record a readiness check before your next run.`
        : 'Stay on this stage and record a readiness check before your next run.',
    );
  }

  // The user chose to pause, with no safety trigger forcing a regress.
  if (userChoseToPause) {
    return build(
      'pause',
      fromStageNumber,
      'Progression is paused at this stage while you take a break — you can pick it up again whenever you are ready.',
      [
        {
          code: 'user-paused',
          message:
            'You chose to pause progression, so this stage stays put until you decide to continue.',
        },
      ],
      'Resume whenever you are ready; the stage will be waiting where you left it.',
    );
  }

  // --- Repeat: hold the current stage (docs/06 §6.3) ---
  // Fires on a missed session, high single-session effort, a single (temporary)
  // amber, or the user lacking confidence. It is also the fail-safe fallback when
  // the advance criteria are not fully met (missing inputs included).
  const repeatReasons: ProgressionReason[] = [];
  if (input.completedSessions < config.requiredSessions) {
    repeatReasons.push({
      code: 'sessions-incomplete',
      message: `You have completed ${input.completedSessions} of the ${config.requiredSessions} sessions this stage needs, so repeat it until they are done.`,
    });
  }
  if (maxEffort !== null && maxEffort >= REPEAT_EFFORT_MIN) {
    repeatReasons.push({
      code: 'effort-high',
      message:
        'Effort was high on at least one session, so repeat this stage until it feels more comfortable before adding more running.',
    });
  }
  if (amberCount === 1) {
    const amber = input.readiness.find(
      (response) => response.level === 'amber',
    );
    repeatReasons.push({
      code: 'temporary-amber',
      message:
        amber?.resolvedBeforeNextSession === true
          ? 'There was a single amber readiness result that had settled by the next session, so repeat this stage rather than progressing just yet.'
          : 'There was a single amber readiness result at this stage, so repeat it rather than progressing just yet.',
    });
  }
  if (userLacksConfidence) {
    repeatReasons.push({
      code: 'not-confident',
      message:
        'You said you are not yet confident to progress, so repeat this stage until it feels right.',
    });
  }

  // If any explicit repeat condition fired, hold the stage now.
  if (repeatReasons.length > 0) {
    return build(
      'repeat',
      fromStageNumber,
      'Repeat this stage next time rather than moving up — there is no rush.',
      repeatReasons,
      'Repeat this stage and record a readiness check before each run.',
    );
  }

  // --- Advance: every criterion must hold (docs/06 §6.3) ---
  // At this point no regress, pause or repeat trigger fired, so: no red anywhere,
  // no altered walking, at most... exactly zero ambers (a single amber would have
  // repeated above), and no high single-session effort. What remains to check is the
  // positive advance evidence: enough completed sessions, both pre-session checks
  // green, every effort recorded with an average no higher than 7, and the user's
  // explicit confirmation. Any gap here is a fail-safe repeat.
  const advanceOk =
    input.completedSessions >= config.requiredSessions &&
    preSessionAllGreen &&
    noRedPostOrNextMorning &&
    amberCount === 0 &&
    allEffortsRecorded &&
    averageEffort !== null &&
    averageEffort <= ADVANCE_AVERAGE_EFFORT_MAX &&
    userConfirmedReadiness;

  if (advanceOk) {
    // The stage-9 ceiling: every criterion is met, but there is no higher stage.
    // Return a clean "already at the final stage" repeat, never an advance.
    if (isFinalStage) {
      return build(
        'repeat',
        fromStageNumber,
        'You are handling the top stage of the programme well. There is no further stage to move up to, so keep enjoying continuous runs at this level.',
        [
          {
            code: 'already-final-stage',
            message: `Stage ${FINAL_STAGE_NUMBER} is the final stage of the run-walk programme, so there is no higher stage to progress to.`,
          },
        ],
        'Keep running at this stage; you have completed the run-walk progression.',
      );
    }
    const toStageNumber = fromStageNumber + 1;
    return build(
      'advance',
      toStageNumber,
      `You have met everything needed to progress. When you are ready, you could move up to stage ${toStageNumber}.`,
      [
        {
          code: 'advance-ready',
          message: `You completed the required sessions with green pre-session checks, no concerning responses and comfortable effort, so moving up to stage ${toStageNumber} is a sensible next step.`,
        },
      ],
      `Confirm when you are ready to progress, and stage ${toStageNumber} will be suggested for your next runs.`,
    );
  }

  // --- Fail-safe repeat: advance was not fully met (missing inputs included) ---
  const holdReasons: ProgressionReason[] = [];
  if (input.completedSessions < config.requiredSessions) {
    holdReasons.push({
      code: 'sessions-incomplete',
      message: `You have completed ${input.completedSessions} of the ${config.requiredSessions} sessions this stage needs, so repeat it until they are done.`,
    });
  }
  if (!preSessionAllGreen) {
    holdReasons.push({
      code: 'pre-session-not-green',
      message:
        'Both pre-session readiness checks were not recorded as green, so repeat this stage until they are.',
    });
  }
  if (!allEffortsRecorded) {
    holdReasons.push({
      code: 'effort-not-recorded',
      message:
        'Effort was not recorded for every session, so repeat this stage until each run has an effort score.',
    });
  } else if (
    averageEffort !== null &&
    averageEffort > ADVANCE_AVERAGE_EFFORT_MAX
  ) {
    holdReasons.push({
      code: 'average-effort-high',
      message:
        'Your average effort was a little high to add more running, so repeat this stage until it feels easier.',
    });
  }
  if (!userConfirmedReadiness) {
    holdReasons.push({
      code: 'not-confirmed',
      message:
        'You have not yet confirmed you are ready to progress, so this stage stays put until you do.',
    });
  }
  if (holdReasons.length === 0) {
    holdReasons.push({
      code: 'standard-not-met',
      message:
        'The full standard for moving up was not quite met, so repeat this stage for now.',
    });
  }
  return build(
    'repeat',
    fromStageNumber,
    'Repeat this stage next time rather than moving up — there is no rush.',
    holdReasons,
    'Repeat this stage and confirm readiness once every criterion is met.',
  );
}

// The now-live wiring of the dormant same-week volume warning (docs/06 §6.5 and
// §6.3: "Running volume should not increase in the same week as a substantial
// lower-body strength increase"). This roadmap finally supplies the running side:
// a running ADVANCE proposal means the running stage increased. When an accepted
// lower-body strength increase also lands in the SAME plan week, the existing,
// unchanged evaluateVolumeIncrease predicate (schedulingRules.ts) surfaces its soft
// conflict. It is a soft warning shown alongside the advance proposal, never a block
// — the user may still proceed (§6.5 makes it soft, unlike the consecutive-runs hard
// rule). The predicate itself is not changed here, only fed.
export function evaluateSameWeekVolumeWarning(input: {
  decision: RunningDecisionCode;
  lowerBodyVolumeIncreased: boolean;
}): SchedulingConflict | null {
  return evaluateVolumeIncrease({
    lowerBodyVolumeIncreased: input.lowerBodyVolumeIncreased,
    runningStageIncreased: input.decision === 'advance',
  });
}
