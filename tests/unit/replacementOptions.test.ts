import { describe, expect, it } from '@jest/globals';

import { buildReplacementOptions } from '@/domain/training/replacementOptions';

const templates = [
  { id: 't-a', name: 'Strength A' },
  { id: 't-b', name: 'Strength B' },
];

describe('buildReplacementOptions', () => {
  it('offers lighter options and the other strength template for a strength day', () => {
    const options = buildReplacementOptions(
      { sessionType: 'strength', templateId: 't-a' },
      templates,
    );
    const keys = options.map((option) => option.key);
    // Recovery-first lighter options, then the opposite strength template only.
    expect(keys).toEqual(['rest', 'achilles', 'cardio', 'strength:t-b']);
    expect(options.every((option) => option.label.length > 0)).toBe(true);
  });

  it('never offers a session its own current type', () => {
    const options = buildReplacementOptions(
      { sessionType: 'rest', templateId: null },
      templates,
    );
    expect(options.map((option) => option.key)).not.toContain('rest');
  });

  it('offers both strength templates when replacing a cardio day', () => {
    const options = buildReplacementOptions(
      { sessionType: 'cardio', templateId: null },
      templates,
    );
    const strengthKeys = options
      .filter((option) => option.toType === 'strength')
      .map((option) => option.toTemplateId);
    expect(strengthKeys).toEqual(['t-a', 't-b']);
    // Cardio is excluded (its own type); rest and achilles remain.
    expect(options.map((option) => option.key)).not.toContain('cardio');
  });

  it('works with no strength templates available', () => {
    const options = buildReplacementOptions(
      { sessionType: 'cardio', templateId: null },
      [],
    );
    expect(options.map((option) => option.key)).toEqual(['rest', 'achilles']);
  });
});
