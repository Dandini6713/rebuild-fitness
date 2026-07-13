import { describe, expect, it } from '@jest/globals';

import {
  evaluateRunningProgression,
  evaluateSameWeekVolumeWarning,
  FINAL_STAGE_NUMBER,
  type ReadinessResponse,
  type RunningProgressionInput,
  type RunningStageConfig,
  RULE_VERSION,
} from '@/domain/training/runningProgression';

// A stage in the middle of the programme, needing two completed sessions to advance
// (the seeded default). Stage 3 leaves room to advance (to 4) and regress (to 2).
const stage = (
  overrides: Partial<RunningStageConfig> = {},
): RunningStageConfig => ({
  requiredSessions: 2,
  stageNumber: 3,
  ...overrides,
});

const greenPre = (): ReadinessResponse => ({
  level: 'green',
  phase: 'pre_session',
});

// A fully qualifying advance input: required sessions done, two green pre-session
// checks, comfortable effort throughout, and the user has confirmed readiness.
const advanceInput = (
  overrides: Partial<RunningProgressionInput> = {},
): RunningProgressionInput => ({
  completedSessions: 2,
  efforts: [6, 7],
  readiness: [greenPre(), greenPre()],
  userConfirmedReadiness: true,
  ...overrides,
});

describe('running progression — the advance rule (docs/06 §6.3)', () => {
  it('proposes advancing to the next stage when every criterion holds', () => {
    const result = evaluateRunningProgression(stage(), advanceInput());
    expect(result.decision).toBe('advance');
    expect(result.fromStageNumber).toBe(3);
    expect(result.toStageNumber).toBe(4);
    expect(result.ruleVersion).toBe(RULE_VERSION);
    expect(result.reasons[0]?.code).toBe('advance-ready');
  });

  it('does not advance without the user’s explicit confirmation', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ userConfirmedReadiness: false }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.toStageNumber).toBe(3);
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'not-confirmed',
    );
  });

  it('does not advance when fewer than the required sessions are completed', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ completedSessions: 1 }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'sessions-incomplete',
    );
  });

  it('does not advance when a pre-session check is missing (fewer than required)', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ readiness: [greenPre()] }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'pre-session-not-green',
    );
  });

  it('does not advance when a pre-session check is not green', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        readiness: [
          greenPre(),
          { level: 'unclassifiable', phase: 'pre_session' },
        ],
      }),
    );
    // An unclassifiable pre-session check is not green, so no advance (fail-safe).
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'pre-session-not-green',
    );
  });
});

describe('running progression — the effort boundary (7 vs 8)', () => {
  it('advances when the average effort is exactly 7 and no session hit 8', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ efforts: [7, 7] }),
    );
    expect(result.decision).toBe('advance');
    expect(result.inputs.averageEffort).toBe(7);
  });

  it('repeats when a single session reached effort 8', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ efforts: [6, 8] }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'effort-high',
    );
  });

  it('repeats when the average effort exceeds 7 even though no single session hit 8', () => {
    // 7 and (a hypothetical) 7.5 average via [7, ...] — use efforts that average
    // above 7 without any single value reaching the repeat threshold of 8.
    const result = evaluateRunningProgression(
      stage({ requiredSessions: 3 }),
      advanceInput({ completedSessions: 3, efforts: [7, 7, 7.5] }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'average-effort-high',
    );
  });

  it('does not advance when an effort was not recorded (fail-safe)', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ efforts: [7, null] }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'effort-not-recorded',
    );
  });
});

describe('running progression — the amber boundary (once vs twice)', () => {
  it('repeats the stage on a single amber response', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          {
            level: 'amber',
            phase: 'post_session',
            resolvedBeforeNextSession: true,
          },
        ],
      }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'temporary-amber',
    );
    expect(result.inputs.amberCount).toBe(1);
  });

  it('regresses the stage on two amber responses in the same stage', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'amber', phase: 'post_session' },
          { level: 'amber', phase: 'next_morning' },
        ],
      }),
    );
    expect(result.decision).toBe('regress');
    expect(result.toStageNumber).toBe(2);
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'two-amber-responses',
    );
  });
});

describe('running progression — the repeat rule (docs/06 §6.3)', () => {
  it('repeats when the user lacks confidence', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ userLacksConfidence: true }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'not-confident',
    );
  });

  it('repeats when a planned session was missed (fewer completed than required)', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ completedSessions: 1, efforts: [6] }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'sessions-incomplete',
    );
  });
});

describe('running progression — the regress/pause rule (docs/06 §6.3)', () => {
  it('regresses on any red response', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'red', phase: 'post_session' },
        ],
      }),
    );
    expect(result.decision).toBe('regress');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'red-response',
    );
  });

  it('regresses on altered walking reported after a session', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'green', phase: 'next_morning', walkingAltered: true },
        ],
      }),
    );
    expect(result.decision).toBe('regress');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'altered-walking',
    );
  });

  it('pauses when the user chose to pause and no safety trigger fired', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ userChoseToPause: true }),
    );
    expect(result.decision).toBe('pause');
    expect(result.toStageNumber).toBe(3);
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'user-paused',
    );
  });

  it('does not regress below stage 1', () => {
    const result = evaluateRunningProgression(
      stage({ stageNumber: 1 }),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'red', phase: 'post_session' },
        ],
      }),
    );
    expect(result.decision).toBe('regress');
    expect(result.toStageNumber).toBe(1);
  });
});

describe('running progression — precedence (safety outranks repeat outranks advance)', () => {
  it('regresses even when a repeat and an advance-qualifying signal are also present', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        userLacksConfidence: true, // a repeat trigger
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'red', phase: 'next_morning' }, // a regress trigger
        ],
      }),
    );
    expect(result.decision).toBe('regress');
  });

  it('a red response can never yield advance or repeat', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'red', phase: 'post_session' },
        ],
      }),
    );
    expect(['advance', 'repeat']).not.toContain(result.decision);
  });

  it('a safety regress outranks the user choosing to pause', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({
        userChoseToPause: true,
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'red', phase: 'post_session' },
        ],
      }),
    );
    expect(result.decision).toBe('regress');
  });
});

describe('running progression — the stage-9 ceiling', () => {
  it('does not propose an advance from the final stage', () => {
    const result = evaluateRunningProgression(
      stage({ stageNumber: FINAL_STAGE_NUMBER }),
      advanceInput(),
    );
    expect(result.decision).toBe('repeat');
    expect(result.toStageNumber).toBe(FINAL_STAGE_NUMBER);
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'already-final-stage',
    );
  });

  it('still regresses from the final stage on a red response', () => {
    const result = evaluateRunningProgression(
      stage({ stageNumber: FINAL_STAGE_NUMBER }),
      advanceInput({
        readiness: [
          greenPre(),
          greenPre(),
          { level: 'red', phase: 'post_session' },
        ],
      }),
    );
    expect(result.decision).toBe('regress');
    expect(result.toStageNumber).toBe(FINAL_STAGE_NUMBER - 1);
  });
});

describe('running progression — fail-safe on missing inputs', () => {
  it('does not advance when no efforts were provided at all', () => {
    const result = evaluateRunningProgression(
      stage(),
      advanceInput({ efforts: [] }),
    );
    expect(result.decision).toBe('repeat');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'effort-not-recorded',
    );
  });

  it('records the inputs used for the audit trail', () => {
    const result = evaluateRunningProgression(stage(), advanceInput());
    expect(result.inputs.requiredSessions).toBe(2);
    expect(result.inputs.completedSessions).toBe(2);
    expect(result.inputs.preSessionAllGreen).toBe(true);
    expect(result.inputs.userConfirmedReadiness).toBe(true);
  });
});

describe('running progression — same-week volume warning (docs/06 §6.5)', () => {
  it('warns only when a running advance coincides with an accepted lower-body increase', () => {
    const warning = evaluateSameWeekVolumeWarning({
      decision: 'advance',
      lowerBodyVolumeIncreased: true,
    });
    expect(warning).not.toBeNull();
    expect(warning?.code).toBe('running-and-strength-volume');
    expect(warning?.severity).toBe('soft');
  });

  it('does not warn when the running stage did not advance', () => {
    expect(
      evaluateSameWeekVolumeWarning({
        decision: 'repeat',
        lowerBodyVolumeIncreased: true,
      }),
    ).toBeNull();
  });

  it('does not warn when there was no lower-body increase that week', () => {
    expect(
      evaluateSameWeekVolumeWarning({
        decision: 'advance',
        lowerBodyVolumeIncreased: false,
      }),
    ).toBeNull();
  });
});
