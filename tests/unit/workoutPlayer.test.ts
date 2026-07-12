import { describe, expect, it } from '@jest/globals';

import {
  completedExerciseCount,
  dedupeByOperationId,
  deriveExerciseProgress,
  isWorkoutComplete,
  type LoggedSet,
  nextSetNumber,
  type PlayerExercise,
  pickPreviousResult,
  resolveCurrentExerciseIndex,
  setsForExercise,
} from '@/domain/training/workoutPlayer';

const exercise = (
  id: string,
  order: number,
  targetSets: number,
): PlayerExercise => ({
  exerciseId: id,
  name: id,
  order,
  repMax: 12,
  repMin: 8,
  restSeconds: 90,
  slug: id,
  targetSets,
});

const set = (exerciseId: string, setNumber: number): LoggedSet => ({
  discomfortScore: 0,
  effortScore: 7,
  exerciseId,
  repetitions: 10,
  setNumber,
  techniqueControlled: true,
  weightKg: 20,
});

const EXERCISES = [exercise('a', 1, 2), exercise('b', 2, 3)];

describe('nextSetNumber', () => {
  it('starts at one when no sets are recorded', () => {
    expect(nextSetNumber([], 'a')).toBe(1);
  });

  it('is one past the highest recorded, not merely the count', () => {
    const sets = [set('a', 1), set('a', 3)];
    expect(nextSetNumber(sets, 'a')).toBe(4);
  });

  it('is scoped to the exercise', () => {
    expect(nextSetNumber([set('a', 1), set('b', 1)], 'b')).toBe(2);
  });
});

describe('deriveExerciseProgress', () => {
  it('reports progress within the target', () => {
    const progress = deriveExerciseProgress(EXERCISES[0]!, [set('a', 1)]);
    expect(progress).toEqual({
      isComplete: false,
      nextSetNumber: 2,
      setsDone: 1,
      setsTarget: 2,
    });
  });

  it('is complete once the target is met and stays complete beyond it', () => {
    const sets = [set('a', 1), set('a', 2), set('a', 3)];
    expect(deriveExerciseProgress(EXERCISES[0]!, sets).isComplete).toBe(true);
  });
});

describe('resolveCurrentExerciseIndex', () => {
  it('points at the first outstanding exercise', () => {
    const sets = [set('a', 1), set('a', 2)];
    expect(resolveCurrentExerciseIndex(EXERCISES, sets)).toBe(1);
  });

  it('returns the exercise count when everything is done', () => {
    const sets = [
      set('a', 1),
      set('a', 2),
      set('b', 1),
      set('b', 2),
      set('b', 3),
    ];
    expect(resolveCurrentExerciseIndex(EXERCISES, sets)).toBe(2);
    expect(isWorkoutComplete(EXERCISES, sets)).toBe(true);
    expect(completedExerciseCount(EXERCISES, sets)).toBe(2);
  });
});

describe('setsForExercise', () => {
  it('returns only the matching exercise in order', () => {
    const sets = [set('a', 1), set('b', 1), set('a', 2)];
    expect(setsForExercise(sets, 'a').map((s) => s.setNumber)).toEqual([1, 2]);
  });
});

describe('pickPreviousResult', () => {
  it('returns null for a genuine first time, never a zero', () => {
    expect(pickPreviousResult([])).toBeNull();
    expect(
      pickPreviousResult([
        { performedAt: '2026-01-01', repetitions: null, weightKg: null },
      ]),
    ).toBeNull();
  });

  it('chooses the most recent set that carries a weight or reps', () => {
    const result = pickPreviousResult([
      { performedAt: '2026-01-01', repetitions: 10, weightKg: 20 },
      { performedAt: '2026-02-01', repetitions: 8, weightKg: 25 },
    ]);
    expect(result).toEqual({
      performedAt: '2026-02-01',
      repetitions: 8,
      weightKg: 25,
    });
  });
});

describe('dedupeByOperationId', () => {
  it('keeps the first occurrence of each operation id', () => {
    const records = [
      { clientOperationId: 'op-1', value: 'first' },
      { clientOperationId: 'op-2', value: 'second' },
      { clientOperationId: 'op-1', value: 'replay' },
    ];
    expect(dedupeByOperationId(records)).toEqual([
      { clientOperationId: 'op-1', value: 'first' },
      { clientOperationId: 'op-2', value: 'second' },
    ]);
  });
});
