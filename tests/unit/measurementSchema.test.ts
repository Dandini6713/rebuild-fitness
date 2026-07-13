import { describe, expect, it } from '@jest/globals';

import {
  MAX_NOTE_LENGTH,
  validateMeasurement,
  type MeasurementDraft,
} from '@/features/measurements/measurementSchema';

const NOW = new Date('2026-07-13T09:00:00.000Z');

function weightDraft(
  overrides: Partial<MeasurementDraft> = {},
): MeasurementDraft {
  return {
    conditionsNote: undefined,
    measuredAt: new Date('2026-07-13T07:00:00.000Z'),
    type: 'weight',
    value: 82.5,
    ...overrides,
  };
}

describe('validateMeasurement', () => {
  it('accepts a valid weight and returns ready-to-insert data with the kg unit', () => {
    const result = validateMeasurement(weightDraft(), NOW);
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data).toEqual({
      conditionsNote: null,
      measuredAtIso: '2026-07-13T07:00:00.000Z',
      type: 'weight',
      unit: 'kg',
      value: 82.5,
    });
  });

  it('accepts a valid waist with the cm unit and a trimmed note', () => {
    const result = validateMeasurement(
      weightDraft({
        conditionsNote: '  after a walk  ',
        type: 'waist',
        value: 90,
      }),
      NOW,
    );
    expect(result.success).toBe(true);
    if (!result.success) {
      return;
    }
    expect(result.data.unit).toBe('cm');
    expect(result.data.conditionsNote).toBe('after a walk');
  });

  it('rejects a missing value', () => {
    const result = validateMeasurement(weightDraft({ value: null }), NOW);
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.errors.value).toBeTruthy();
  });

  it('rejects a non-positive or implausible value against the type bounds', () => {
    expect(validateMeasurement(weightDraft({ value: 0 }), NOW).success).toBe(
      false,
    );
    expect(validateMeasurement(weightDraft({ value: -5 }), NOW).success).toBe(
      false,
    );
    expect(validateMeasurement(weightDraft({ value: 8000 }), NOW).success).toBe(
      false,
    );
    // A weight of 500 kg is the upper bound (inclusive); 501 is rejected.
    expect(validateMeasurement(weightDraft({ value: 500 }), NOW).success).toBe(
      true,
    );
    expect(validateMeasurement(weightDraft({ value: 501 }), NOW).success).toBe(
      false,
    );
  });

  it('rejects more than two decimal places (the numeric(7,2) precision)', () => {
    expect(
      validateMeasurement(weightDraft({ value: 82.55 }), NOW).success,
    ).toBe(true);
    const result = validateMeasurement(weightDraft({ value: 82.555 }), NOW);
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.errors.value).toContain('two decimal places');
  });

  it('rejects a future measured date but allows back-dating', () => {
    const future = validateMeasurement(
      weightDraft({ measuredAt: new Date('2026-07-14T09:00:00.000Z') }),
      NOW,
    );
    expect(future.success).toBe(false);
    if (!future.success) {
      expect(future.errors.measuredAt).toContain('future');
    }
    const backDated = validateMeasurement(
      weightDraft({ measuredAt: new Date('2026-07-01T09:00:00.000Z') }),
      NOW,
    );
    expect(backDated.success).toBe(true);
  });

  it('rejects an oversized note', () => {
    const result = validateMeasurement(
      weightDraft({ conditionsNote: 'x'.repeat(MAX_NOTE_LENGTH + 1) }),
      NOW,
    );
    expect(result.success).toBe(false);
    if (result.success) {
      return;
    }
    expect(result.errors.conditionsNote).toBeTruthy();
  });
});
