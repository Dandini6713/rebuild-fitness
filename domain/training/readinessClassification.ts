// The Achilles readiness classification from docs/06 §6.2, as small pure functions
// with no React and no I/O — mirroring schedulingRules.ts and strengthProgression.ts.
// The trusted server RPC (submit_readiness_checkin) re-computes this same decision
// in SQL before it writes, so the client never chooses its own classification; this
// module is the single source of the rules that both the SQL port and the UI follow.
// docs/06 §6.1 is explicit: a decision returns a classification, a recommendation,
// human-readable reasons, the inputs used, the rule version and a suggested next
// action. Every branch is unit tested, including the precedence and the boundaries,
// because this decision gates a real person's training on a healing tendon.
//
// Precedence (docs/06 §6.2): red overrides amber overrides green. A missing or
// invalid required answer prevents classification — it returns an explicit
// "unclassifiable" decision and NEVER silently defaults to green (docs/10 §10.2).
//
// Safety and language (docs/07). Nothing here diagnoses, treats or assesses an
// injury: pain, stiffness, swelling and walking are plain self-reported answers, and
// the recommendations are conservative activity choices, never medical advice. The
// red copy follows docs/07 §7.2 — it says the app cannot determine the cause and
// points to professional care. No shame-based or appearance-based language is used.
//
// Deliberate seams (clean, not omissions):
//   - "The previous run produced a material next-morning increase" (an amber trigger,
//     docs/06 §6.2) depends on prior next-morning check-ins, which do not exist until
//     there is history. It is an OPTIONAL input (previousNextMorningIncrease): absent
//     means unknown and cannot raise amber on its own — the same shape as the
//     readiness seam in schedulingRules.ts. A later step feeds it from stored rows.
//   - "The user explicitly states they cannot load the leg normally" (a red trigger,
//     docs/06 §6.2) has no dedicated field in the S-011 form (docs/03), whose inputs
//     are pain / stiffness / swelling / walking / sudden change / confidence. It is
//     honoured as an OPTIONAL input (cannotBearWeight) when a future form collects it;
//     until then altered walking with pain is the available signal. Documented, not
//     guessed.
//   - The amber recommendation to "replace running with walking / cycling / rest and
//     reduce lower-body volume 30–50%" is returned as guidance here; performing the
//     activity swap is the substitution flow (roadmap 15), not built in this module.

export const RULE_VERSION = 'readiness/v1';

// The stable marker the trusted start RPC (start_scheduled_session, roadmap 14) puts
// in its exception message when it refuses to start a running or demanding lower-body
// session because the latest pre-session readiness result is red (docs/06 §6.5 hard
// rule, docs/07 §7.4). The client detects it to render the honest red result screen
// instead of a generic connection error. Kept here, beside the rules, so both the
// Today and workout-player start paths read the same single source.
export const READINESS_RED_BLOCK_MARKER = 'readiness-red-block';

// True when a failed session-start RPC call was the server refusing a red-blocked
// start (as opposed to an ordinary error or a dropped connection). Detection is by the
// message marker: it survives the PostgREST boundary in error.message unchanged.
export function isReadinessBlockError(
  error: { message?: string | null } | null | undefined,
): boolean {
  return (error?.message ?? '').includes(READINESS_RED_BLOCK_MARKER);
}

export type StiffnessChange = 'better' | 'same' | 'worse';
export type SwellingLevel = 'none' | 'mild' | 'significant';
export type WalkingStatus = 'normal' | 'altered';
export type ReadinessClassification = 'green' | 'amber' | 'red';

// The pain thresholds (docs/06 §6.2). Pain of 6 or higher is red; 3 to 5 is amber;
// 0 to 2 is compatible with green. Altered walking becomes red once pain reaches 4.
const PAIN_RED_MIN = 6;
const PAIN_AMBER_MIN = 3;
const PAIN_AMBER_MAX = 5;
const PAIN_GREEN_MAX = 2;
const WALKING_ALTERED_RED_PAIN_MIN = 4;
// Confidence of 1 or 2 out of 5 is an amber trigger (docs/06 §6.2).
const CONFIDENCE_AMBER_MAX = 2;

const STIFFNESS_VALUES: readonly StiffnessChange[] = [
  'better',
  'same',
  'worse',
];
const SWELLING_VALUES: readonly SwellingLevel[] = [
  'none',
  'mild',
  'significant',
];
const WALKING_VALUES: readonly WalkingStatus[] = ['normal', 'altered'];

// The raw answers a readiness form supplies. Every required field is nullable
// because a form in progress may not have collected it yet, and the classifier must
// treat a gap as "cannot classify", not as a benign value. Numbers may also arrive
// out of range from an untrusted boundary; those are rejected the same way.
export type ReadinessInputs = {
  painScore: number | null;
  stiffnessChange: StiffnessChange | null;
  swellingLevel: SwellingLevel | null;
  walkingStatus: WalkingStatus | null;
  suddenChange: boolean | null;
  confidenceScore: number | null;
  // Optional context (see the seam notes). Absent means unknown; an absent optional
  // input can never, by itself, change the classification.
  sessionType?: string | null;
  previousNextMorningIncrease?: boolean | null;
  cannotBearWeight?: boolean | null;
};

// A structured, human-readable reason: a stable code plus a plain British-English
// sentence. No shame-based language and nothing implying diagnosis (docs/07).
export type ReadinessReason = { code: string; message: string };

// The validated inputs actually used to reach the decision (docs/06 §6.1), for the
// audit trail. Null where an input was missing or invalid.
export type ReadinessUsedInputs = {
  painScore: number | null;
  stiffnessChange: StiffnessChange | null;
  swellingLevel: SwellingLevel | null;
  walkingStatus: WalkingStatus | null;
  suddenChange: boolean | null;
  confidenceScore: number | null;
  previousNextMorningIncrease: boolean;
  cannotBearWeight: boolean;
};

// The §6.1 decision shape. `classifiable` is false only when a required answer is
// missing or invalid; `classification` is then null and `missingInputs` names the
// gaps. Callers must handle the unclassifiable case explicitly — it is never green.
export type ReadinessDecision = {
  classifiable: boolean;
  classification: ReadinessClassification | null;
  reasons: ReadinessReason[];
  recommendation: string;
  // What the user may do next, in plain terms (docs/03 S-011 "allowed action").
  allowedAction: string;
  // The suggested next action (docs/06 §6.1).
  nextAction: string;
  inputs: ReadinessUsedInputs;
  missingInputs: string[];
  ruleVersion: string;
};

function isValidPain(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 0 && value <= 10;
}

function isValidConfidence(value: number | null): value is number {
  return value !== null && Number.isInteger(value) && value >= 1 && value <= 5;
}

// Which required answers are missing or out of range. Order is stable so the copy
// and any tests are deterministic.
function findMissingInputs(inputs: ReadinessInputs): string[] {
  const missing: string[] = [];
  if (!isValidPain(inputs.painScore)) {
    missing.push('painScore');
  }
  if (
    inputs.stiffnessChange === null ||
    !STIFFNESS_VALUES.includes(inputs.stiffnessChange)
  ) {
    missing.push('stiffnessChange');
  }
  if (
    inputs.swellingLevel === null ||
    !SWELLING_VALUES.includes(inputs.swellingLevel)
  ) {
    missing.push('swellingLevel');
  }
  if (
    inputs.walkingStatus === null ||
    !WALKING_VALUES.includes(inputs.walkingStatus)
  ) {
    missing.push('walkingStatus');
  }
  if (typeof inputs.suddenChange !== 'boolean') {
    missing.push('suddenChange');
  }
  if (!isValidConfidence(inputs.confidenceScore)) {
    missing.push('confidenceScore');
  }
  return missing;
}

// The red triggers (docs/06 §6.2), each reported as its own reason so the result is
// explainable. Evaluated on already-validated inputs.
function redReasons(inputs: {
  painScore: number;
  swellingLevel: SwellingLevel;
  walkingStatus: WalkingStatus;
  suddenChange: boolean;
  cannotBearWeight: boolean;
}): ReadinessReason[] {
  const reasons: ReadinessReason[] = [];
  if (inputs.suddenChange) {
    reasons.push({
      code: 'sudden-change',
      message:
        'You reported a sudden new change, such as pulling, popping or a sharp increase. This needs attention before any session.',
    });
  }
  if (
    inputs.walkingStatus === 'altered' &&
    inputs.painScore >= WALKING_ALTERED_RED_PAIN_MIN
  ) {
    reasons.push({
      code: 'altered-walking-with-pain',
      message:
        'Your walking feels altered and your pain is at a level where it is best not to load the leg today.',
    });
  }
  if (inputs.swellingLevel === 'significant') {
    reasons.push({
      code: 'significant-swelling',
      message:
        'You reported significant new swelling, so it is best not to start this session.',
    });
  }
  if (inputs.painScore >= PAIN_RED_MIN) {
    reasons.push({
      code: 'high-pain',
      message:
        'Your pain is high enough that it is best not to start this session today.',
    });
  }
  if (inputs.cannotBearWeight) {
    reasons.push({
      code: 'cannot-bear-weight',
      message:
        'You said you cannot load the leg normally, so this session should not go ahead today.',
    });
  }
  return reasons;
}

// The amber triggers (docs/06 §6.2), evaluated only when no red trigger fired.
function amberReasons(inputs: {
  painScore: number;
  stiffnessChange: StiffnessChange;
  swellingLevel: SwellingLevel;
  walkingStatus: WalkingStatus;
  confidenceScore: number;
  previousNextMorningIncrease: boolean;
}): ReadinessReason[] {
  const reasons: ReadinessReason[] = [];
  if (
    inputs.painScore >= PAIN_AMBER_MIN &&
    inputs.painScore <= PAIN_AMBER_MAX
  ) {
    reasons.push({
      code: 'moderate-pain',
      message:
        'Your pain is in a moderate range, so a gentler option is the sensible choice today.',
    });
  }
  if (inputs.stiffnessChange === 'worse') {
    reasons.push({
      code: 'worse-stiffness',
      message:
        'Your morning stiffness is worse than usual, so ease off rather than pushing today.',
    });
  }
  if (inputs.swellingLevel === 'mild') {
    reasons.push({
      code: 'mild-swelling',
      message:
        'You reported mild new swelling, so a lighter, lower-impact option is wise today.',
    });
  }
  // Altered walking with pain below the red threshold: abnormal but not clearly
  // limping (docs/06 §6.2). Altered walking with pain at or above the threshold is
  // already red and never reaches here.
  if (inputs.walkingStatus === 'altered') {
    reasons.push({
      code: 'altered-walking',
      message:
        'Your walking feels a little off, so choose a gentler option rather than a demanding session today.',
    });
  }
  if (inputs.confidenceScore <= CONFIDENCE_AMBER_MAX) {
    reasons.push({
      code: 'low-confidence',
      message:
        'You are not feeling very confident today, so a gentler option is the sensible choice.',
    });
  }
  if (inputs.previousNextMorningIncrease) {
    reasons.push({
      code: 'previous-next-morning-increase',
      message:
        'Your last run left the tendon more sore the next morning, so hold the running week and keep things gentle.',
    });
  }
  return reasons;
}

// The red professional-care recommendation (docs/07 §7.2). This is the escalation
// copy; the exact wording is reviewed before public release (docs/07 §7.2).
const RED_RECOMMENDATION =
  'Do not start this session. You reported a sudden or significant change. The app cannot determine the cause. Seek prompt advice from an appropriate healthcare professional, and use urgent services if the injury is severe, you cannot bear weight, or you are otherwise concerned.';
const RED_ALLOWED_ACTION =
  'You can still log and view your data. Starting the planned session is not advised today.';
const RED_NEXT_ACTION =
  'Rest today and seek advice from an appropriate healthcare professional.';

const AMBER_RECOMMENDATION =
  'A gentler option is the sensible choice today. Replace any run with flat walking, easy cycling or rest, and reduce lower-body strength volume where a comfortable alternative exists.';
const AMBER_ALLOWED_ACTION =
  'You can do a gentler, lower-impact session instead of the demanding one, or take a rest day.';
const AMBER_NEXT_ACTION =
  'Swap to a gentler option and check in again next morning to see how the tendon settles.';

const GREEN_RECOMMENDATION =
  'Your answers do not raise any flags today, so you can go ahead with the planned session. This does not guarantee the tendon is fine — stop and reassess if anything changes.';
const GREEN_ALLOWED_ACTION = 'You can start the planned session.';
const GREEN_NEXT_ACTION =
  'Go ahead with the planned session and check in afterwards.';

const UNCLASSIFIABLE_RECOMMENDATION =
  'We could not complete your readiness check because some answers are missing. Please answer every question so a result can be shown.';
const UNCLASSIFIABLE_ALLOWED_ACTION =
  'Answer the remaining questions to see your result.';
const UNCLASSIFIABLE_NEXT_ACTION =
  'Complete the readiness check and it will be classified.';

// The presentation copy for a stored classification (green / amber / red). The
// server stores only the classification, rule version and structured reasons; a
// result screen re-derives this classification-level copy from that code so there is
// a single source of truth for the wording (used by features/readiness). The red
// copy is the docs/07 §7.2 professional-care escalation.
export type ClassificationPresentation = {
  recommendation: string;
  allowedAction: string;
  nextAction: string;
};

export function presentClassification(
  classification: ReadinessClassification,
): ClassificationPresentation {
  if (classification === 'red') {
    return {
      allowedAction: RED_ALLOWED_ACTION,
      nextAction: RED_NEXT_ACTION,
      recommendation: RED_RECOMMENDATION,
    };
  }
  if (classification === 'amber') {
    return {
      allowedAction: AMBER_ALLOWED_ACTION,
      nextAction: AMBER_NEXT_ACTION,
      recommendation: AMBER_RECOMMENDATION,
    };
  }
  return {
    allowedAction: GREEN_ALLOWED_ACTION,
    nextAction: GREEN_NEXT_ACTION,
    recommendation: GREEN_RECOMMENDATION,
  };
}

// Classify a set of readiness answers (docs/06 §6.2). Pure: it proposes a result and
// never writes it. Missing or invalid required answers return an unclassifiable
// decision, never green.
export function classifyReadiness(inputs: ReadinessInputs): ReadinessDecision {
  const missingInputs = findMissingInputs(inputs);
  const previousNextMorningIncrease =
    inputs.previousNextMorningIncrease === true;
  const cannotBearWeight = inputs.cannotBearWeight === true;

  const used: ReadinessUsedInputs = {
    cannotBearWeight,
    confidenceScore: isValidConfidence(inputs.confidenceScore)
      ? inputs.confidenceScore
      : null,
    painScore: isValidPain(inputs.painScore) ? inputs.painScore : null,
    previousNextMorningIncrease,
    stiffnessChange:
      inputs.stiffnessChange !== null &&
      STIFFNESS_VALUES.includes(inputs.stiffnessChange)
        ? inputs.stiffnessChange
        : null,
    suddenChange:
      typeof inputs.suddenChange === 'boolean' ? inputs.suddenChange : null,
    swellingLevel:
      inputs.swellingLevel !== null &&
      SWELLING_VALUES.includes(inputs.swellingLevel)
        ? inputs.swellingLevel
        : null,
    walkingStatus:
      inputs.walkingStatus !== null &&
      WALKING_VALUES.includes(inputs.walkingStatus)
        ? inputs.walkingStatus
        : null,
  };

  if (missingInputs.length > 0) {
    return {
      allowedAction: UNCLASSIFIABLE_ALLOWED_ACTION,
      classifiable: false,
      classification: null,
      inputs: used,
      missingInputs,
      nextAction: UNCLASSIFIABLE_NEXT_ACTION,
      reasons: [
        {
          code: 'missing-inputs',
          message:
            'Some answers are missing, so a readiness result cannot be worked out yet.',
        },
      ],
      recommendation: UNCLASSIFIABLE_RECOMMENDATION,
      ruleVersion: RULE_VERSION,
    };
  }

  // Every required input is present and valid past this point.
  const painScore = used.painScore as number;
  const stiffnessChange = used.stiffnessChange as StiffnessChange;
  const swellingLevel = used.swellingLevel as SwellingLevel;
  const walkingStatus = used.walkingStatus as WalkingStatus;
  const suddenChange = used.suddenChange as boolean;
  const confidenceScore = used.confidenceScore as number;

  // Red first — it overrides everything (docs/06 §6.2 precedence).
  const red = redReasons({
    cannotBearWeight,
    painScore,
    suddenChange,
    swellingLevel,
    walkingStatus,
  });
  if (red.length > 0) {
    return {
      allowedAction: RED_ALLOWED_ACTION,
      classifiable: true,
      classification: 'red',
      inputs: used,
      missingInputs: [],
      nextAction: RED_NEXT_ACTION,
      reasons: red,
      recommendation: RED_RECOMMENDATION,
      ruleVersion: RULE_VERSION,
    };
  }

  // Amber next — it overrides green.
  const amber = amberReasons({
    confidenceScore,
    painScore,
    previousNextMorningIncrease,
    stiffnessChange,
    swellingLevel,
    walkingStatus,
  });
  if (amber.length > 0) {
    return {
      allowedAction: AMBER_ALLOWED_ACTION,
      classifiable: true,
      classification: 'amber',
      inputs: used,
      missingInputs: [],
      nextAction: AMBER_NEXT_ACTION,
      reasons: amber,
      recommendation: AMBER_RECOMMENDATION,
      ruleVersion: RULE_VERSION,
    };
  }

  // Green is the complement: with every input present and neither red nor amber
  // triggered, the answers necessarily satisfy the docs/06 §6.2 green criteria
  // (pain 0–2, no sudden change, no significant swelling, normal walking, stiffness
  // same or better, confidence 3–5). Asserted here for clarity and defence in depth.
  const greenSatisfied =
    painScore <= PAIN_GREEN_MAX &&
    !suddenChange &&
    swellingLevel === 'none' &&
    walkingStatus === 'normal' &&
    stiffnessChange !== 'worse' &&
    confidenceScore > CONFIDENCE_AMBER_MAX;

  if (!greenSatisfied) {
    // Unreachable with complete inputs (the branches above are exhaustive), but
    // never fabricate a green result: fall back to unclassifiable if this ever trips.
    return {
      allowedAction: UNCLASSIFIABLE_ALLOWED_ACTION,
      classifiable: false,
      classification: null,
      inputs: used,
      missingInputs: [],
      nextAction: UNCLASSIFIABLE_NEXT_ACTION,
      reasons: [
        {
          code: 'inconclusive',
          message:
            'Your answers could not be resolved to a clear result. Please review them and try again.',
        },
      ],
      recommendation: UNCLASSIFIABLE_RECOMMENDATION,
      ruleVersion: RULE_VERSION,
    };
  }

  return {
    allowedAction: GREEN_ALLOWED_ACTION,
    classifiable: true,
    classification: 'green',
    inputs: used,
    missingInputs: [],
    nextAction: GREEN_NEXT_ACTION,
    reasons: [
      {
        code: 'all-clear',
        message:
          'Your pain is low, your walking is normal and there is no sudden change or significant swelling, so you can go ahead.',
      },
    ],
    recommendation: GREEN_RECOMMENDATION,
    ruleVersion: RULE_VERSION,
  };
}
