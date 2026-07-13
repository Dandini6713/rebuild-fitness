// The amber activity-substitution options (docs/06 §6.2), as small pure functions
// with no React and no I/O — mirroring readinessClassification.ts and
// schedulingRules.ts. After an amber readiness result the guidance is to replace a
// run (or a demanding lower-body session) with a gentler option: flat walking, easy
// cycling, the cross-trainer, or rest, and not to progress the running week. This
// module names those approved options and maps each to the database session_type the
// linked replacement is written as, plus the British-English reason recorded on it.
//
// The cardio-activity-typing seam (roadmap 09 / roadmap 16): the base plan types all
// low-impact cardio as a single 'cardio' session_type, so a walk, a bike ride and a
// cross-trainer session all become a 'cardio'-typed replacement here, with the
// SPECIFIC chosen activity captured in the reason. Rest becomes a 'rest'-typed
// replacement. When roadmap 16 introduces distinct cardio activity types the mapping's
// newType becomes specific; nothing else about the substitution changes.
//
// Nothing here diagnoses, treats or assesses injury (docs/07): these are conservative
// activity choices, and the copy is plain and never shame-based.

// The database session_type a substitution is written as. Only these two are approved
// amber targets; the specific activity lives in the reason (see the seam note).
export type SubstitutionSessionType = 'cardio' | 'rest';

// The concrete gentler activities offered to the user (docs/06 §6.2, plus the
// cross-trainer). Each resolves to a SubstitutionSessionType.
export type SubstitutionActivity = 'walk' | 'bike' | 'cross_trainer' | 'rest';

export type SubstitutionOption = {
  activity: SubstitutionActivity;
  // The short label shown on the choice (British English).
  label: string;
  // A plain, gentle one-line description of the option.
  description: string;
  // The session_type the linked replacement is written as.
  newType: SubstitutionSessionType;
};

// The approved options, in the order docs/06 §6.2 presents them (walking, cycling,
// then the cross-trainer, then rest). Order is stable so the UI and tests are
// deterministic.
export const SUBSTITUTION_OPTIONS: readonly SubstitutionOption[] = [
  {
    activity: 'walk',
    description: 'A steady, flat walk instead of your planned session.',
    label: 'Flat walking',
    newType: 'cardio',
  },
  {
    activity: 'bike',
    description: 'Easy cycling that keeps the impact off the tendon.',
    label: 'Easy cycling',
    newType: 'cardio',
  },
  {
    activity: 'cross_trainer',
    description: 'A gentle cross-trainer session, low impact throughout.',
    label: 'Cross-trainer',
    newType: 'cardio',
  },
  {
    activity: 'rest',
    description: 'Take today as a rest day and let things settle.',
    label: 'Rest day',
    newType: 'rest',
  },
] as const;

// The activity label used inside the recorded reason, so the specific choice survives
// even though a walk/bike/cross-trainer all store as 'cardio' (the seam above).
const REASON_ACTIVITY: Record<SubstitutionActivity, string> = {
  bike: 'easy cycling',
  cross_trainer: 'a cross-trainer session',
  rest: 'a rest day',
  walk: 'flat walking',
};

export function findSubstitutionOption(
  activity: SubstitutionActivity,
): SubstitutionOption {
  const option = SUBSTITUTION_OPTIONS.find(
    (candidate) => candidate.activity === activity,
  );
  if (!option) {
    // Unreachable: activity is a closed union and every member is listed above.
    throw new Error(`Unknown substitution activity: ${activity}`);
  }
  return option;
}

// The British-English reason recorded on the replacement's reschedule_reason (kept
// well under the 500-character column limit). It names the amber result and the chosen
// alternative so the audit trail explains why the swap was made.
export function buildSubstitutionReason(
  activity: SubstitutionActivity,
): string {
  return `Amber readiness result — replaced with ${REASON_ACTIVITY[activity]}. The running week does not progress.`;
}

// What the repository needs to perform a substitution for a chosen activity: the
// session_type to write and the reason to record. Pure, so it is fully tested.
export type ResolvedSubstitution = {
  newType: SubstitutionSessionType;
  reason: string;
};

export function resolveSubstitution(
  activity: SubstitutionActivity,
): ResolvedSubstitution {
  return {
    newType: findSubstitutionOption(activity).newType,
    reason: buildSubstitutionReason(activity),
  };
}
