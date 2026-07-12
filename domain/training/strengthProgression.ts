// The strength progression rules from docs/06 §6.4, as small pure functions with
// no React and no I/O — mirroring schedulingRules.ts. The workout player's
// repository calls evaluateStrengthProgression when a strength session completes to
// produce a proposal per exercise; it never re-implements the logic, and it never
// applies the result. Every rule is unit tested, including the boundaries (reps at
// the top of the range versus one below, effort 8 versus 9, discomfort 2/3/4,
// technique true/false/null, one qualifying exposure versus two), because these
// decisions shape a real person's training.
//
// The engine proposes; it never writes and never applies. docs/06 §6.1 is explicit:
// a decision returns a code, a recommendation, human-readable reasons, the inputs
// used, the rule version and a suggested next action. Nothing here diagnoses,
// treats or assesses injury (docs/07): discomfort is a plain self-reported score,
// and "reduce or substitute" is a training suggestion, never medical advice.
//
// Fail safe. Any missing signal on a set — a null technique flag, effort or
// discomfort — fails the increase criteria. A weight increase is only ever
// proposed on positive evidence across every prescribed set, so an unrecorded
// value can never be read as "good enough to add load".
//
// Deliberate seams (clean, not omissions):
//   - Amber readiness and poor sleep are optional context inputs. When a caller
//     does not supply them they are simply unknown and cannot trigger a hold on
//     their own — the same shape as the readiness seam in schedulingRules.ts. The
//     readiness classification feature (docs/06 §6.2) and any sleep source are
//     later roadmap items; when they land they pass { amberReadiness, poorSleep }
//     into this engine, which already honours them.
//   - "A movement produces sharp pain" (docs/06 §6.4) has no distinct data source.
//     Discomfort at or above 4 on any set is the proxy used here, and is
//     documented as such; a dedicated pain signal can be added later without
//     changing the decision shape.
//   - How an accepted lower-body increase feeds the dormant volume-increase warning
//     (evaluateVolumeIncrease in schedulingRules.ts) is noted at the bottom of this
//     file. That wiring waits for the running side (roadmap 17); it is NOT done
//     here.

export const RULE_VERSION = 'strength-progression/v1';

// The increase criteria thresholds (docs/06 §6.4). Effort no higher than 8 out of
// 10, discomfort 0 to 2. Discomfort of 4 or higher is the reduce/substitute proxy
// for "sharp pain" (see the seam note above).
const EFFORT_INCREASE_MAX = 8;
const DISCOMFORT_INCREASE_MAX = 2;
const DISCOMFORT_REDUCE_MIN = 4;
// Effort at or above this on any set blocks an increase (docs/06 §6.4: effort must
// be no higher than 8, so 9 or 10 holds).
const EFFORT_HOLD_MIN = 9;

// The per-exercise configuration the rules read, taken from the template exercise
// (workout_template_exercises). A null rep range marks a timed hold (the farmer
// carry) that this rep-based engine cannot assess. A null increment marks an
// exercise that is simply not eligible for a weight-increase proposal (the dead bug
// and farmer carry): it can still hold or reduce, but never increase.
export type ExerciseProgressionConfig = {
  repMin: number | null;
  repMax: number | null;
  targetSets: number;
  weightIncrementKg: number | null;
  singleExposureProgression: boolean;
};

// One recorded set within an exposure. Every field is nullable because the source
// rows are (a bodyweight set has no weight; an uncaptured flag is null). A null
// technique, effort or discomfort fails the increase criteria — never passes them.
export type ExposureSet = {
  weightKg: number | null;
  repetitions: number | null;
  effortScore: number | null;
  discomfortScore: number | null;
  techniqueControlled: boolean | null;
};

// One exposure: the sets logged for an exercise within a single completed workout
// (one workout_logs row). The caller passes exposures MOST RECENT FIRST; the engine
// looks only at the most recent one (or two, per single_exposure_progression).
export type Exposure = {
  sets: ExposureSet[];
};

// Optional context that can force a hold (docs/06 §6.4). Absent means unknown, and
// an absent input can never trigger a hold by itself (see the seam note).
export type ProgressionContext = {
  amberReadiness?: boolean;
  poorSleep?: boolean;
  userNotConfident?: boolean;
};

export type DecisionCode = 'increase' | 'hold' | 'reduce_or_substitute';

// A structured, human-readable reason: a stable code plus a plain British-English
// sentence. No shame-based language, and nothing implying diagnosis (docs/07).
export type ProgressionReason = {
  code: string;
  message: string;
};

// A JSON-serialisable summary of one exposure, stored in the proposal's `inputs`
// so a decision can always be explained after the fact. No undefined values.
export type ExposureSummary = {
  setCount: number;
  allSetsAtRepMax: boolean;
  allTechniqueControlled: boolean;
  maxEffort: number | null;
  maxDiscomfort: number | null;
  minRepetitions: number | null;
  workingWeightKg: number | null;
};

// The inputs actually used to reach the decision (docs/06 §6.1). Purely for the
// audit trail; the decision does not depend on anything outside these.
export type ProgressionInputs = {
  repMin: number | null;
  repMax: number | null;
  targetSets: number;
  weightIncrementKg: number | null;
  singleExposureProgression: boolean;
  requiredExposures: number;
  exposuresProvided: number;
  amberReadiness: boolean;
  poorSleep: boolean;
  userNotConfident: boolean;
  currentWeightKg: number | null;
  exposuresConsidered: ExposureSummary[];
};

// The §6.1 decision shape. `evaluable` is false for the honest "not evaluable"
// hold (a timed hold, or too few exposures yet): still a hold-shaped decision, but
// flagged so callers and copy can be honest that no real assessment was possible.
export type ProgressionDecision = {
  decision: DecisionCode;
  evaluable: boolean;
  recommendation: string;
  proposedWeightKg: number | null;
  currentWeightKg: number | null;
  reasons: ProgressionReason[];
  inputs: ProgressionInputs;
  ruleVersion: string;
  nextAction: string;
};

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// The working weight of an exposure: the heaviest weight recorded across its sets,
// or null when none carry a weight (a bodyweight movement).
function workingWeight(exposure: Exposure): number | null {
  const weights = exposure.sets
    .map((set) => set.weightKg)
    .filter((weight): weight is number => weight !== null);
  return weights.length === 0 ? null : Math.max(...weights);
}

function summariseExposure(
  exposure: Exposure,
  repMax: number | null,
): ExposureSummary {
  const sets = exposure.sets;
  const efforts = sets
    .map((set) => set.effortScore)
    .filter((score): score is number => score !== null);
  const discomforts = sets
    .map((set) => set.discomfortScore)
    .filter((score): score is number => score !== null);
  const reps = sets
    .map((set) => set.repetitions)
    .filter((count): count is number => count !== null);
  return {
    allSetsAtRepMax:
      repMax !== null &&
      sets.length > 0 &&
      sets.every(
        (set) => set.repetitions !== null && set.repetitions >= repMax,
      ),
    allTechniqueControlled:
      sets.length > 0 && sets.every((set) => set.techniqueControlled === true),
    maxDiscomfort: discomforts.length === 0 ? null : Math.max(...discomforts),
    maxEffort: efforts.length === 0 ? null : Math.max(...efforts),
    minRepetitions: reps.length === 0 ? null : Math.min(...reps),
    setCount: sets.length,
    workingWeightKg: workingWeight(exposure),
  };
}

// Whether one exposure meets the full increase standard (docs/06 §6.4): every
// prescribed set performed, each reaching the top of the rep range with controlled
// technique, effort no higher than 8 and discomfort no higher than 2. A null on any
// set fails — the standard is only met on positive evidence.
function exposureMeetsIncreaseStandard(
  exposure: Exposure,
  config: ExerciseProgressionConfig,
): boolean {
  const { repMax, targetSets } = config;
  if (repMax === null) {
    return false;
  }
  if (exposure.sets.length < targetSets) {
    return false;
  }
  return exposure.sets.every(
    (set) =>
      set.repetitions !== null &&
      set.repetitions >= repMax &&
      set.techniqueControlled === true &&
      set.effortScore !== null &&
      set.effortScore <= EFFORT_INCREASE_MAX &&
      set.discomfortScore !== null &&
      set.discomfortScore <= DISCOMFORT_INCREASE_MAX,
  );
}

function anySetDiscomfortAtLeast(
  exposure: Exposure,
  threshold: number,
): boolean {
  return exposure.sets.some(
    (set) => set.discomfortScore !== null && set.discomfortScore >= threshold,
  );
}

// Reps below the bottom of the range on any set: "target repetitions cannot be
// reached" (docs/06 §6.4). A null rep count is a data gap, not evidence of failing
// the target, so it does not trigger a reduction (it does still block an increase).
function anySetBelowRepMin(exposure: Exposure, repMin: number): boolean {
  return exposure.sets.some(
    (set) => set.repetitions !== null && set.repetitions < repMin,
  );
}

// The reasons an exposure fell short of an increase, for an honest hold. Reports
// every applicable factor; falls back to a generic sentence if none stand out.
function holdReasons(
  exposure: Exposure,
  config: ExerciseProgressionConfig,
  requiredExposures: number,
  qualifyingCount: number,
): ProgressionReason[] {
  const reasons: ProgressionReason[] = [];
  const { repMax, targetSets } = config;

  if (exposure.sets.length < targetSets) {
    reasons.push({
      code: 'sets-incomplete',
      message:
        'Not every prescribed set was recorded this session, so it is best to keep the weight the same for now.',
    });
  }
  const repsAtTop =
    repMax !== null &&
    exposure.sets.length > 0 &&
    exposure.sets.every(
      (set) => set.repetitions !== null && set.repetitions >= repMax,
    );
  if (!repsAtTop) {
    reasons.push({
      code: 'reps-below-top',
      message:
        'You are working within your rep range but not yet at the top of it, so keep the weight the same and aim for a little more.',
    });
  }
  if (exposure.sets.some((set) => set.techniqueControlled !== true)) {
    reasons.push({
      code: 'technique-uncertain',
      message:
        'Technique was not marked as controlled on every set, so hold the weight until it feels solid throughout.',
    });
  }
  if (
    exposure.sets.some(
      (set) => set.effortScore === null || set.effortScore >= EFFORT_HOLD_MIN,
    )
  ) {
    reasons.push({
      code: 'effort-high',
      message:
        'Effort was high on at least one set, so keep the weight the same and let it feel more comfortable before adding load.',
    });
  }
  if (
    exposure.sets.some(
      (set) =>
        set.discomfortScore === null ||
        (set.discomfortScore > DISCOMFORT_INCREASE_MAX &&
          set.discomfortScore < DISCOMFORT_REDUCE_MIN),
    )
  ) {
    reasons.push({
      code: 'discomfort-present',
      message:
        'There was some discomfort recorded, so keep the weight the same this time and see how it settles.',
    });
  }
  // Two exposures are needed and only the most recent one qualified.
  if (
    requiredExposures > 1 &&
    qualifyingCount < requiredExposures &&
    reasons.length === 0
  ) {
    reasons.push({
      code: 'standard-not-repeated',
      message:
        'You met the standard for an increase once. Repeat it next session and a heavier weight will be suggested.',
    });
  }
  if (reasons.length === 0) {
    reasons.push({
      code: 'standard-not-met',
      message:
        'The full standard for adding weight was not quite met, so keep the weight the same for now.',
    });
  }
  return reasons;
}

// Evaluate one exercise's recent exposures and return a §6.1 decision. Exposures
// are MOST RECENT FIRST. The engine only proposes; nothing here writes or applies.
export function evaluateStrengthProgression(
  config: ExerciseProgressionConfig,
  exposures: readonly Exposure[],
  context: ProgressionContext = {},
): ProgressionDecision {
  const amberReadiness = context.amberReadiness === true;
  const poorSleep = context.poorSleep === true;
  const userNotConfident = context.userNotConfident === true;
  const requiredExposures = config.singleExposureProgression ? 1 : 2;

  const mostRecent = exposures[0] ?? null;
  const currentWeightKg = mostRecent ? workingWeight(mostRecent) : null;

  const consideredCount = Math.max(requiredExposures, mostRecent ? 1 : 0);
  const inputs: ProgressionInputs = {
    amberReadiness,
    currentWeightKg,
    exposuresConsidered: exposures
      .slice(0, consideredCount)
      .map((exposure) => summariseExposure(exposure, config.repMax)),
    exposuresProvided: exposures.length,
    poorSleep,
    repMax: config.repMax,
    repMin: config.repMin,
    requiredExposures,
    singleExposureProgression: config.singleExposureProgression,
    targetSets: config.targetSets,
    userNotConfident,
    weightIncrementKg: config.weightIncrementKg,
  };

  const build = (
    decision: DecisionCode,
    evaluable: boolean,
    recommendation: string,
    reasons: ProgressionReason[],
    nextAction: string,
    proposedWeightKg: number | null,
  ): ProgressionDecision => ({
    currentWeightKg,
    decision,
    evaluable,
    inputs,
    nextAction,
    proposedWeightKg,
    reasons,
    recommendation,
    ruleVersion: RULE_VERSION,
  });

  // A timed hold (null rep range, e.g. the farmer carry): this rep-based engine
  // cannot assess it, so it is honestly not evaluable — never an increase.
  if (config.repMin === null || config.repMax === null) {
    return build(
      'hold',
      false,
      'This is a timed hold rather than a weighted lift on a rep target, so there is no weight change to suggest here.',
      [
        {
          code: 'time-based-exercise',
          message:
            'This movement is held for time rather than counted in reps, so an automatic weight suggestion does not apply.',
        },
      ],
      'Keep the same weight or time, and progress it by feel.',
      null,
    );
  }

  // No completed exposures at all: nothing to assess yet.
  if (!mostRecent) {
    return build(
      'hold',
      false,
      'There are no completed sessions for this exercise yet, so there is nothing to suggest.',
      [
        {
          code: 'no-exposures',
          message:
            'Once you have completed this exercise, a weight suggestion will appear here.',
        },
      ],
      'Complete the exercise and check back next time.',
      null,
    );
  }

  // Reduce or substitute takes precedence — it is the conservative, safety-first
  // response (docs/06 §6.4). Discomfort at or above 4 (the sharp-pain proxy), reps
  // below the target range, or the user telling us they are not confident.
  const reduceReasons: ProgressionReason[] = [];
  if (anySetDiscomfortAtLeast(mostRecent, DISCOMFORT_REDUCE_MIN)) {
    reduceReasons.push({
      code: 'discomfort-high',
      message:
        'Discomfort was higher than we would want for adding load, so ease the weight back or choose a gentler alternative.',
    });
  }
  if (anySetBelowRepMin(mostRecent, config.repMin)) {
    reduceReasons.push({
      code: 'reps-below-range',
      message:
        'The target repetitions were not reached with controlled technique, so a lighter weight will let you work in range.',
    });
  }
  if (userNotConfident) {
    reduceReasons.push({
      code: 'not-confident',
      message:
        'You said you are not confident with this exercise, so ease the weight back or swap it for an approved alternative.',
    });
  }
  if (reduceReasons.length > 0) {
    // Suggest one increment lighter when we can compute it; otherwise leave the
    // weight unset and let the user choose a lighter weight or an alternative.
    const proposed =
      config.weightIncrementKg !== null && currentWeightKg !== null
        ? Math.max(0, round2(currentWeightKg - config.weightIncrementKg))
        : null;
    return build(
      'reduce_or_substitute',
      true,
      'It looks like a gentler approach would help here — easing the weight back or choosing an approved alternative.',
      reduceReasons,
      proposed !== null
        ? `Consider ${proposed} kg next time, or swap to an approved alternative from the exercise guide.`
        : 'Consider a lighter weight next time, or swap to an approved alternative from the exercise guide.',
      proposed,
    );
  }

  // Not enough qualifying history yet for an increase decision.
  if (exposures.length < requiredExposures) {
    return build(
      'hold',
      false,
      'Keep the weight the same for now — a suggestion will appear once there is a little more history at this weight.',
      [
        {
          code: 'insufficient-exposures',
          message:
            'A weight increase is only suggested once the standard has been met across the required number of sessions.',
        },
      ],
      'Keep the weight the same and complete this exercise again.',
      null,
    );
  }

  // Poor sleep or an amber readiness result holds the weight, even when the
  // performance would otherwise qualify (docs/06 §6.4).
  if (amberReadiness || poorSleep) {
    const reasons: ProgressionReason[] = [];
    if (amberReadiness) {
      reasons.push({
        code: 'amber-readiness',
        message:
          'This session followed an amber readiness result, so keep the weight the same rather than adding load today.',
      });
    }
    if (poorSleep) {
      reasons.push({
        code: 'poor-sleep',
        message:
          'This session followed a poor night of sleep, so keep the weight the same rather than adding load today.',
      });
    }
    return build(
      'hold',
      true,
      'Keep the weight the same this time, given how the day was set up.',
      reasons,
      'Keep the weight the same and reassess next session.',
      null,
    );
  }

  // Increase: the standard is met across all required exposures.
  const requiredList = exposures.slice(0, requiredExposures);
  const qualifyingCount = requiredList.filter((exposure) =>
    exposureMeetsIncreaseStandard(exposure, config),
  ).length;
  const allQualify = qualifyingCount === requiredExposures;

  if (allQualify) {
    // Qualifies on performance, but the exercise is not eligible for a weight
    // increase (no configured increment — e.g. the dead bug). Hold, honestly.
    if (config.weightIncrementKg === null) {
      return build(
        'hold',
        true,
        'You are handling this exercise well. It is not one we add fixed weight to, so keep going as you are.',
        [
          {
            code: 'increment-not-configured',
            message:
              'This exercise is not set up for automatic weight increases, so keep the weight the same and progress it by feel.',
          },
        ],
        'Keep the weight the same and focus on quality of movement.',
        null,
      );
    }
    // Qualifies, but we have no recorded weight to add to (an unusual data gap on
    // a weighted lift). Hold rather than invent a starting point.
    if (currentWeightKg === null) {
      return build(
        'hold',
        true,
        'You met the standard for an increase, but there is no recorded weight to build on yet.',
        [
          {
            code: 'no-current-weight',
            message:
              'Record the weight you use and a specific heavier suggestion can be made next time.',
          },
        ],
        'Log the weight you use so a heavier target can be suggested.',
        null,
      );
    }
    const proposed = round2(currentWeightKg + config.weightIncrementKg);
    return build(
      'increase',
      true,
      `You reached the top of your rep range with controlled technique and comfortable effort${
        requiredExposures > 1 ? ' across two sessions' : ''
      }. You could add ${config.weightIncrementKg} kg next time.`,
      [
        {
          code: 'increase-ready',
          message: `Every set reached the top of the range with controlled technique, effort of ${EFFORT_INCREASE_MAX} or under and low discomfort, so adding ${config.weightIncrementKg} kg is a sensible next step.`,
        },
      ],
      `Try ${proposed} kg next time — only ${config.weightIncrementKg} kg more — if you are happy to.`,
      proposed,
    );
  }

  // Otherwise, hold — and say honestly why the increase standard was not met.
  return build(
    'hold',
    true,
    'Keep the weight the same this time.',
    holdReasons(mostRecent, config, requiredExposures, qualifyingCount),
    'Keep the weight the same and aim to meet the full standard next session.',
    null,
  );
}

// Seam (see the header note): when an accepted lower-body strength increase later
// needs to feed the dormant "don't raise running and lower-body volume in the same
// week" warning (evaluateVolumeIncrease in schedulingRules.ts), the wiring is: an
// accepted 'increase' proposal for a lower-body exercise in a given week sets
// lowerBodyVolumeIncreased = true for that week's evaluateVolumeIncrease call. That
// predicate is dormant until running progression (roadmap 17) supplies the running
// side, so nothing calls it yet and this function does not reach into scheduling.
