// Pure set-state and progression logic for the strength workout player (S-012).
// The player shows one exercise at a time and records sets; this module decides,
// from the template and the sets recorded so far, how far through each exercise
// and the whole workout the user is, what the next set number is, and what the
// "previous result" for an exercise should read. No React, no I/O, exhaustively
// tested — the hook, view and repository call these; they never re-implement them.
//
// Nothing here diagnoses or assesses anything (docs/07). Discomfort is carried as
// a plain self-reported score on a set, never interpreted.

// One exercise in the session, resolved from a workout template's exercises joined
// to the shared catalogue. `restSeconds` may be null (the template need not set
// one); reps are a range and may both be null for a time-held movement (the seed's
// farmer carry), in which case the view shows a hold cue rather than a rep target.
export type PlayerExercise = {
  exerciseId: string;
  slug: string;
  name: string;
  order: number;
  targetSets: number;
  repMin: number | null;
  repMax: number | null;
  restSeconds: number | null;
};

// A set the user has recorded in this session, mirrored from the local-first store
// (the source of truth while a workout is live). Weight and reps are nullable so a
// bodyweight or time-held set is honest rather than a fabricated zero.
export type LoggedSet = {
  exerciseId: string;
  setNumber: number;
  weightKg: number | null;
  repetitions: number | null;
  effortScore: number | null;
  discomfortScore: number | null;
};

// A prior result for one exercise, taken from earlier sessions' set logs. Held
// separately from the live sets: it is context, not something recorded this time.
export type PreviousResult = {
  weightKg: number | null;
  repetitions: number | null;
  performedAt: string;
};

export type ExerciseProgress = {
  setsDone: number;
  setsTarget: number;
  isComplete: boolean;
  nextSetNumber: number;
};

// The sets already recorded for one exercise, in the order they were logged.
export function setsForExercise(
  loggedSets: readonly LoggedSet[],
  exerciseId: string,
): LoggedSet[] {
  return loggedSets.filter((set) => set.exerciseId === exerciseId);
}

// The next set number for an exercise: one past the highest recorded so far, or 1
// when none exist. Uses the maximum rather than the count so a gap (should one ever
// occur) never silently reuses a number that would collide on the unique
// (exercise_log_id, set_number) constraint.
export function nextSetNumber(
  loggedSets: readonly LoggedSet[],
  exerciseId: string,
): number {
  const numbers = setsForExercise(loggedSets, exerciseId).map(
    (set) => set.setNumber,
  );
  return numbers.length === 0 ? 1 : Math.max(...numbers) + 1;
}

// How far through a single exercise the user is. An exercise is complete once it
// has at least its target number of sets (extra sets never make it "over-complete";
// it simply stays complete).
export function deriveExerciseProgress(
  exercise: PlayerExercise,
  loggedSets: readonly LoggedSet[],
): ExerciseProgress {
  const setsDone = setsForExercise(loggedSets, exercise.exerciseId).length;
  return {
    isComplete: setsDone >= exercise.targetSets,
    nextSetNumber: nextSetNumber(loggedSets, exercise.exerciseId),
    setsDone,
    setsTarget: exercise.targetSets,
  };
}

// The index of the exercise the player should show: the first one that still has
// sets outstanding. When every exercise has met its target, returns the exercise
// count (a sentinel meaning "all done") so the caller can offer to finish. Callers
// clamp their own display index against this to keep manual navigation in range.
export function resolveCurrentExerciseIndex(
  exercises: readonly PlayerExercise[],
  loggedSets: readonly LoggedSet[],
): number {
  const index = exercises.findIndex(
    (exercise) => !deriveExerciseProgress(exercise, loggedSets).isComplete,
  );
  return index === -1 ? exercises.length : index;
}

// Whether every exercise in the session has met its target number of sets.
export function isWorkoutComplete(
  exercises: readonly PlayerExercise[],
  loggedSets: readonly LoggedSet[],
): boolean {
  return (
    exercises.length > 0 &&
    exercises.every(
      (exercise) => deriveExerciseProgress(exercise, loggedSets).isComplete,
    )
  );
}

// The count of exercises fully complete, for the header progress read-out.
export function completedExerciseCount(
  exercises: readonly PlayerExercise[],
  loggedSets: readonly LoggedSet[],
): number {
  return exercises.filter(
    (exercise) => deriveExerciseProgress(exercise, loggedSets).isComplete,
  ).length;
}

// A candidate previous set: the weight/reps recorded against an exercise in an
// earlier session, with when it was performed so the most recent can be chosen.
export type PriorSet = {
  weightKg: number | null;
  repetitions: number | null;
  performedAt: string;
};

// Choose the "previous result" to show for an exercise: the most recent prior set
// that actually carries a weight or reps. A first-ever exercise (no prior sets, or
// only empty ones) returns null so the view can say so honestly rather than
// showing a misleading zero.
export function pickPreviousResult(
  priorSets: readonly PriorSet[],
): PreviousResult | null {
  const meaningful = priorSets.filter(
    (set) => set.weightKg !== null || set.repetitions !== null,
  );
  if (meaningful.length === 0) {
    return null;
  }
  const latest = meaningful.reduce((best, set) =>
    set.performedAt > best.performedAt ? set : best,
  );
  return {
    performedAt: latest.performedAt,
    repetitions: latest.repetitions,
    weightKg: latest.weightKg,
  };
}

// Collapse a list of recorded sets to one per stable operation id, keeping the
// first occurrence. The client generates one operation id per set when it is first
// recorded, so a replay (after backgrounding or reconnecting) carries the same id
// and is dropped here as well as by the database's unique constraint — belt and
// braces, so a resumed session never shows a set twice locally either.
export function dedupeByOperationId<T extends { clientOperationId: string }>(
  records: readonly T[],
): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const record of records) {
    if (seen.has(record.clientOperationId)) {
      continue;
    }
    seen.add(record.clientOperationId);
    result.push(record);
  }
  return result;
}
