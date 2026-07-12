import { describe, expect, it } from '@jest/globals';

import {
  type ExerciseProgressionConfig,
  type Exposure,
  type ExposureSet,
  evaluateStrengthProgression,
  RULE_VERSION,
} from '@/domain/training/strengthProgression';

// A standard weighted movement: 2 sets of 8–12, 2.5 kg increment, two exposures
// needed. Mirrors the seeded leg press.
const config = (
  overrides: Partial<ExerciseProgressionConfig> = {},
): ExerciseProgressionConfig => ({
  repMax: 12,
  repMin: 8,
  singleExposureProgression: false,
  targetSets: 2,
  weightIncrementKg: 2.5,
  ...overrides,
});

// A set that fully meets the increase standard: top of the range, controlled,
// comfortable effort, low discomfort.
const goodSet = (overrides: Partial<ExposureSet> = {}): ExposureSet => ({
  discomfortScore: 1,
  effortScore: 7,
  repetitions: 12,
  techniqueControlled: true,
  weightKg: 40,
  ...overrides,
});

const exposure = (...sets: ExposureSet[]): Exposure => ({ sets });
// A qualifying exposure = two good sets (targetSets = 2).
const goodExposure = (overrides: Partial<ExposureSet> = {}): Exposure =>
  exposure(goodSet(overrides), goodSet(overrides));

describe('strength progression — the increase rule', () => {
  it('proposes exactly the configured increment when two exposures qualify', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure(),
      goodExposure(),
    ]);
    expect(result.decision).toBe('increase');
    expect(result.currentWeightKg).toBe(40);
    expect(result.proposedWeightKg).toBe(42.5);
    expect(result.ruleVersion).toBe(RULE_VERSION);
    expect(result.reasons[0]?.code).toBe('increase-ready');
  });

  it('never proposes more than the configured increment', () => {
    const small = evaluateStrengthProgression(
      config({ weightIncrementKg: 1.0 }),
      [goodExposure({ weightKg: 30 }), goodExposure({ weightKg: 30 })],
    );
    expect(small.decision).toBe('increase');
    // Exactly one increment, no more.
    expect(small.proposedWeightKg).toBe(31);
  });

  it('holds on a single qualifying exposure when two are required', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure(),
      // The older exposure fell short (reps below the top).
      goodExposure({ repetitions: 9 }),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'standard-not-repeated',
    );
    expect(result.proposedWeightKg).toBeNull();
  });

  it('increases on a single exposure when configured for single-exposure progression', () => {
    const result = evaluateStrengthProgression(
      config({ singleExposureProgression: true }),
      [goodExposure()],
    );
    expect(result.decision).toBe('increase');
    expect(result.proposedWeightKg).toBe(42.5);
  });
});

describe('strength progression — rep boundaries', () => {
  it('increases when every set reaches rep_max', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure({ repetitions: 12 }),
      goodExposure({ repetitions: 12 }),
    ]);
    expect(result.decision).toBe('increase');
  });

  it('holds when a set is one rep below the top of the range', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet({ repetitions: 12 }), goodSet({ repetitions: 11 })),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'reps-below-top',
    );
  });

  it('honours a fixed single-value range (low step-up, top of range is 8)', () => {
    const stepUp = config({ repMax: 8, repMin: 8 });
    const atTop = evaluateStrengthProgression(stepUp, [
      goodExposure({ repetitions: 8 }),
      goodExposure({ repetitions: 8 }),
    ]);
    expect(atTop.decision).toBe('increase');

    const belowTop = evaluateStrengthProgression(stepUp, [
      exposure(goodSet({ repetitions: 8 }), goodSet({ repetitions: 7 })),
      goodExposure({ repetitions: 8 }),
    ]);
    // 7 is below the rep_min of 8, so this is a reduce, not merely a hold.
    expect(belowTop.decision).toBe('reduce_or_substitute');
    expect(belowTop.reasons.map((reason) => reason.code)).toContain(
      'reps-below-range',
    );
  });
});

describe('strength progression — effort boundary', () => {
  it('increases at effort 8', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure({ effortScore: 8 }),
      goodExposure({ effortScore: 8 }),
    ]);
    expect(result.decision).toBe('increase');
  });

  it('holds at effort 9', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet({ effortScore: 8 }), goodSet({ effortScore: 9 })),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'effort-high',
    );
  });
});

describe('strength progression — discomfort boundary', () => {
  it('increases at discomfort 2', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure({ discomfortScore: 2 }),
      goodExposure({ discomfortScore: 2 }),
    ]);
    expect(result.decision).toBe('increase');
  });

  it('holds at discomfort 3', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet({ discomfortScore: 3 }), goodSet()),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'discomfort-present',
    );
  });

  it('reduces or substitutes at discomfort 4', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet({ discomfortScore: 4 }), goodSet()),
      goodExposure(),
    ]);
    expect(result.decision).toBe('reduce_or_substitute');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'discomfort-high',
    );
    // A gentler weight is suggested: one increment lighter.
    expect(result.proposedWeightKg).toBe(37.5);
  });
});

describe('strength progression — technique fail-safe', () => {
  it('increases when technique is controlled on every set', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure({ techniqueControlled: true }),
      goodExposure({ techniqueControlled: true }),
    ]);
    expect(result.decision).toBe('increase');
  });

  it('holds when technique is marked not controlled', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet(), goodSet({ techniqueControlled: false })),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'technique-uncertain',
    );
  });

  it('holds when technique is null (a missing flag never counts as controlled)', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet(), goodSet({ techniqueControlled: null })),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'technique-uncertain',
    );
  });

  it('holds when effort is null (a missing effort never satisfies the increase criteria)', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet(), goodSet({ effortScore: null })),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.decision).not.toBe('increase');
    // A missing score is reported as unrecorded, never as high effort.
    const codes = result.reasons.map((reason) => reason.code);
    expect(codes).toContain('effort-not-recorded');
    expect(codes).not.toContain('effort-high');
  });

  it('holds when discomfort is null, describing it as not recorded rather than present', () => {
    const result = evaluateStrengthProgression(config(), [
      exposure(goodSet(), goodSet({ discomfortScore: null })),
      goodExposure(),
    ]);
    expect(result.decision).toBe('hold');
    expect(result.decision).not.toBe('increase');
    const codes = result.reasons.map((reason) => reason.code);
    expect(codes).toContain('discomfort-not-recorded');
    expect(codes).not.toContain('discomfort-present');
  });
});

describe('strength progression — eligibility and evaluability', () => {
  it('blocks an increase when the increment is null, even when everything else qualifies', () => {
    const result = evaluateStrengthProgression(
      config({ weightIncrementKg: null }),
      [goodExposure(), goodExposure()],
    );
    expect(result.decision).toBe('hold');
    expect(result.decision).not.toBe('increase');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'increment-not-configured',
    );
    expect(result.proposedWeightKg).toBeNull();
  });

  it('is not evaluable for a timed hold with a null rep range (the farmer carry)', () => {
    const result = evaluateStrengthProgression(
      config({ repMax: null, repMin: null, weightIncrementKg: null }),
      [goodExposure(), goodExposure()],
    );
    expect(result.decision).toBe('hold');
    expect(result.evaluable).toBe(false);
    expect(result.decision).not.toBe('increase');
    expect(result.reasons[0]?.code).toBe('time-based-exercise');
  });

  it('is not evaluable with no completed exposures', () => {
    const result = evaluateStrengthProgression(config(), []);
    expect(result.decision).toBe('hold');
    expect(result.evaluable).toBe(false);
    expect(result.reasons[0]?.code).toBe('no-exposures');
  });

  it('is not evaluable with fewer exposures than required', () => {
    const result = evaluateStrengthProgression(config(), [goodExposure()]);
    expect(result.decision).toBe('hold');
    expect(result.evaluable).toBe(false);
    expect(result.reasons[0]?.code).toBe('insufficient-exposures');
  });
});

describe('strength progression — optional context seams', () => {
  it('increases when amber/sleep context is absent (an unknown input cannot force a hold)', () => {
    const result = evaluateStrengthProgression(config(), [
      goodExposure(),
      goodExposure(),
    ]);
    expect(result.decision).toBe('increase');
    expect(result.inputs.amberReadiness).toBe(false);
    expect(result.inputs.poorSleep).toBe(false);
  });

  it('holds after an amber readiness result even when the performance qualifies', () => {
    const result = evaluateStrengthProgression(
      config(),
      [goodExposure(), goodExposure()],
      { amberReadiness: true },
    );
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'amber-readiness',
    );
  });

  it('holds after poor sleep even when the performance qualifies', () => {
    const result = evaluateStrengthProgression(
      config(),
      [goodExposure(), goodExposure()],
      { poorSleep: true },
    );
    expect(result.decision).toBe('hold');
    expect(result.reasons.map((reason) => reason.code)).toContain('poor-sleep');
  });

  it('reduces or substitutes when the user is not confident with the exercise', () => {
    const result = evaluateStrengthProgression(
      config(),
      [goodExposure(), goodExposure()],
      { userNotConfident: true },
    );
    expect(result.decision).toBe('reduce_or_substitute');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'not-confident',
    );
  });
});
