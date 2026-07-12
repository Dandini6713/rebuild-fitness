import { describe, expect, it } from '@jest/globals';

import {
  type ReadinessAnswersDraft,
  validatePostSessionExtras,
  validateReadinessAnswers,
} from '@/features/readiness/readinessSchema';

const completeDraft = (
  overrides: Partial<ReadinessAnswersDraft> = {},
): ReadinessAnswersDraft => ({
  confidenceScore: 4,
  painScore: 2,
  stiffnessChange: 'same',
  suddenChange: false,
  swellingLevel: 'none',
  walkingStatus: 'normal',
  ...overrides,
});

describe('readiness form validation — the six S-011 answers', () => {
  it('accepts a fully answered draft', () => {
    const result = validateReadinessAnswers(completeDraft());
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.painScore).toBe(2);
    expect(result.data.suddenChange).toBe(false);
  });

  it('requires every field, reporting a message for each missing one', () => {
    const result = validateReadinessAnswers({
      confidenceScore: null,
      painScore: null,
      stiffnessChange: null,
      suddenChange: null,
      swellingLevel: null,
      walkingStatus: null,
    });
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.errors.painScore).toBeTruthy();
    expect(result.errors.stiffnessChange).toBeTruthy();
    expect(result.errors.swellingLevel).toBeTruthy();
    expect(result.errors.walkingStatus).toBeTruthy();
    expect(result.errors.suddenChange).toBeTruthy();
    expect(result.errors.confidenceScore).toBeTruthy();
  });

  it('rejects an out-of-range pain score', () => {
    const result = validateReadinessAnswers(completeDraft({ painScore: 11 }));
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.errors.painScore).toBeTruthy();
  });

  it('rejects a confidence score outside 1 to 5', () => {
    expect(
      validateReadinessAnswers(completeDraft({ confidenceScore: 0 })).success,
    ).toBe(false);
    expect(
      validateReadinessAnswers(completeDraft({ confidenceScore: 6 })).success,
    ).toBe(false);
  });

  it('does not treat a false sudden-change answer as missing', () => {
    // suddenChange: false is a real, answered value — not an absent one.
    const result = validateReadinessAnswers(
      completeDraft({ suddenChange: false }),
    );
    expect(result.success).toBe(true);
  });
});

describe('post-session extras validation (S-015)', () => {
  it('requires a session effort between 1 and 10', () => {
    expect(validatePostSessionExtras({ sessionEffort: null }).success).toBe(
      false,
    );
    expect(validatePostSessionExtras({ sessionEffort: 11 }).success).toBe(
      false,
    );
    expect(validatePostSessionExtras({ sessionEffort: 6 }).success).toBe(true);
  });

  it('accepts an optional note and the schedule-next-morning flag', () => {
    const result = validatePostSessionExtras({
      notes: 'Felt steady throughout.',
      scheduleNextMorning: true,
      sessionEffort: 5,
    });
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.notes).toBe('Felt steady throughout.');
    expect(result.data.scheduleNextMorning).toBe(true);
  });

  it('rejects an over-long note', () => {
    const result = validatePostSessionExtras({
      notes: 'x'.repeat(2001),
      sessionEffort: 5,
    });
    expect(result.success).toBe(false);
  });
});
