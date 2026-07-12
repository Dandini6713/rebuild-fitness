import { describe, expect, it } from '@jest/globals';

import {
  classifyReadiness,
  type ReadinessInputs,
  RULE_VERSION,
} from '@/domain/training/readinessClassification';

// A baseline set of answers that classifies green: low pain, no sudden change, no
// swelling, normal walking, stiffness the same, full confidence. Individual tests
// override one field at a time to drive a specific branch.
const greenInputs = (
  overrides: Partial<ReadinessInputs> = {},
): ReadinessInputs => ({
  confidenceScore: 5,
  painScore: 1,
  stiffnessChange: 'same',
  suddenChange: false,
  swellingLevel: 'none',
  walkingStatus: 'normal',
  ...overrides,
});

describe('readiness classification — green', () => {
  it('classifies calm answers as green (docs/10 §10.2: pain 0, no symptoms)', () => {
    const result = classifyReadiness(greenInputs({ painScore: 0 }));
    expect(result.classifiable).toBe(true);
    expect(result.classification).toBe('green');
    expect(result.ruleVersion).toBe(RULE_VERSION);
    expect(result.reasons[0]?.code).toBe('all-clear');
    expect(result.missingInputs).toEqual([]);
  });

  it('treats pain of 2 with a better morning as still green', () => {
    const result = classifyReadiness(
      greenInputs({ painScore: 2, stiffnessChange: 'better' }),
    );
    expect(result.classification).toBe('green');
  });

  it('does not claim the tendon is fine — green does not guarantee safety', () => {
    const result = classifyReadiness(greenInputs());
    expect(result.recommendation.toLowerCase()).not.toContain('healed');
    expect(result.recommendation).toContain('does not guarantee');
  });
});

describe('readiness classification — amber', () => {
  it('classifies pain of 3 as amber (docs/10 §10.2)', () => {
    const result = classifyReadiness(greenInputs({ painScore: 3 }));
    expect(result.classification).toBe('amber');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'moderate-pain',
    );
  });

  it('classifies pain of 5 as amber (upper boundary of the amber band)', () => {
    expect(
      classifyReadiness(greenInputs({ painScore: 5 })).classification,
    ).toBe('amber');
  });

  it('classifies worse stiffness with pain 1 as amber (docs/10 §10.2)', () => {
    const result = classifyReadiness(
      greenInputs({ painScore: 1, stiffnessChange: 'worse' }),
    );
    expect(result.classification).toBe('amber');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'worse-stiffness',
    );
  });

  it('classifies mild swelling as amber', () => {
    expect(
      classifyReadiness(greenInputs({ swellingLevel: 'mild' })).classification,
    ).toBe('amber');
  });

  it('classifies altered walking with low pain as amber (abnormal, not limping)', () => {
    const result = classifyReadiness(
      greenInputs({ painScore: 2, walkingStatus: 'altered' }),
    );
    expect(result.classification).toBe('amber');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'altered-walking',
    );
  });

  it('classifies low confidence (1 or 2 of 5) as amber', () => {
    expect(
      classifyReadiness(greenInputs({ confidenceScore: 2 })).classification,
    ).toBe('amber');
    expect(
      classifyReadiness(greenInputs({ confidenceScore: 1 })).classification,
    ).toBe('amber');
  });

  it('raises amber from the optional previous next-morning increase when supplied', () => {
    const result = classifyReadiness(
      greenInputs({ previousNextMorningIncrease: true }),
    );
    expect(result.classification).toBe('amber');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'previous-next-morning-increase',
    );
  });

  it('leaves the optional previous next-morning increase dormant when absent', () => {
    // The seam is dormant until there is history: not supplying it must not raise
    // amber on otherwise green answers.
    expect(classifyReadiness(greenInputs()).classification).toBe('green');
  });

  it('recommends a gentler option without performing any swap (roadmap 15 seam)', () => {
    const result = classifyReadiness(greenInputs({ painScore: 3 }));
    expect(result.recommendation.toLowerCase()).toContain('walking');
    expect(result.allowedAction.toLowerCase()).toContain('gentler');
  });
});

describe('readiness classification — red', () => {
  it('classifies pain of 6 as red (docs/10 §10.2)', () => {
    const result = classifyReadiness(greenInputs({ painScore: 6 }));
    expect(result.classification).toBe('red');
    expect(result.reasons.map((reason) => reason.code)).toContain('high-pain');
  });

  it('classifies significant swelling as red (docs/10 §10.2)', () => {
    const result = classifyReadiness(
      greenInputs({ swellingLevel: 'significant' }),
    );
    expect(result.classification).toBe('red');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'significant-swelling',
    );
  });

  it('classifies a sudden change as red (docs/10 §10.2)', () => {
    const result = classifyReadiness(greenInputs({ suddenChange: true }));
    expect(result.classification).toBe('red');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'sudden-change',
    );
  });

  it('classifies altered walking with pain 4 as red (boundary)', () => {
    const result = classifyReadiness(
      greenInputs({ painScore: 4, walkingStatus: 'altered' }),
    );
    expect(result.classification).toBe('red');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'altered-walking-with-pain',
    );
  });

  it('keeps altered walking with pain 3 amber, not red (below the threshold)', () => {
    const result = classifyReadiness(
      greenInputs({ painScore: 3, walkingStatus: 'altered' }),
    );
    expect(result.classification).toBe('amber');
  });

  it('honours the optional cannot-bear-weight input as red when supplied', () => {
    const result = classifyReadiness(greenInputs({ cannotBearWeight: true }));
    expect(result.classification).toBe('red');
    expect(result.reasons.map((reason) => reason.code)).toContain(
      'cannot-bear-weight',
    );
  });

  it('shows professional-care guidance for a red result (docs/07 §7.2)', () => {
    const result = classifyReadiness(greenInputs({ painScore: 8 }));
    expect(result.recommendation).toContain('Do not start this session');
    expect(result.recommendation.toLowerCase()).toContain(
      'healthcare professional',
    );
    expect(result.recommendation).toContain('cannot determine the cause');
    expect(result.allowedAction.toLowerCase()).toContain('log and view');
  });
});

describe('readiness classification — precedence (docs/06 §6.2)', () => {
  it('lets red override otherwise-green values (docs/10 §10.2)', () => {
    // Every other answer is green, but a sudden change is present.
    const result = classifyReadiness(greenInputs({ suddenChange: true }));
    expect(result.classification).toBe('red');
  });

  it('lets red override amber values', () => {
    // Pain 6 (red) alongside mild swelling and low confidence (amber): still red.
    const result = classifyReadiness(
      greenInputs({
        confidenceScore: 1,
        painScore: 6,
        swellingLevel: 'mild',
      }),
    );
    expect(result.classification).toBe('red');
  });

  it('lets amber override green values', () => {
    // Pain 4 (amber band) with everything else green.
    expect(
      classifyReadiness(greenInputs({ painScore: 4 })).classification,
    ).toBe('amber');
  });
});

describe('readiness classification — unclassifiable (never green)', () => {
  it('returns unclassifiable, not green, when a required input is missing (docs/10 §10.2)', () => {
    const result = classifyReadiness(greenInputs({ painScore: null }));
    expect(result.classifiable).toBe(false);
    expect(result.classification).toBeNull();
    expect(result.missingInputs).toContain('painScore');
  });

  it('never defaults a missing sudden-change answer to a benign value', () => {
    const result = classifyReadiness(
      greenInputs({ suddenChange: null as unknown as boolean }),
    );
    expect(result.classifiable).toBe(false);
    expect(result.missingInputs).toContain('suddenChange');
  });

  it('rejects an out-of-range pain score as unclassifiable', () => {
    const result = classifyReadiness(greenInputs({ painScore: 11 }));
    expect(result.classifiable).toBe(false);
    expect(result.missingInputs).toContain('painScore');
  });

  it('rejects an invalid confidence score as unclassifiable', () => {
    const result = classifyReadiness(greenInputs({ confidenceScore: 0 }));
    expect(result.classifiable).toBe(false);
    expect(result.missingInputs).toContain('confidenceScore');
  });

  it('reports every missing input, not just the first', () => {
    const result = classifyReadiness({
      confidenceScore: null,
      painScore: null,
      stiffnessChange: null,
      suddenChange: null,
      swellingLevel: null,
      walkingStatus: null,
    });
    expect(result.classification).toBeNull();
    expect(result.missingInputs).toEqual([
      'painScore',
      'stiffnessChange',
      'swellingLevel',
      'walkingStatus',
      'suddenChange',
      'confidenceScore',
    ]);
  });
});
