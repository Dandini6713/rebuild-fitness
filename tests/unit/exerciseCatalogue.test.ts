import { describe, expect, it } from '@jest/globals';

import {
  buildGuideSections,
  type CatalogueExercise,
  groupCatalogueExercises,
  STRENGTH_A_SLUGS,
  STRENGTH_B_SLUGS,
} from '@/domain/training/exerciseCatalogue';

function exercise(
  overrides: Partial<CatalogueExercise> & { slug: string },
): CatalogueExercise {
  return {
    approvedAlternatives: 'Alt',
    breathing: 'Breathe out on effort',
    commonMistakes: 'Rushing',
    equipmentSetup: 'Set the seat',
    movement: 'Press and return',
    name: overrides.slug,
    startingPosition: 'Sit tall',
    stopCriteria: 'Stop for sharp pain',
    ...overrides,
  };
}

describe('groupCatalogueExercises', () => {
  it('groups the twelve exercises into Strength A and B in session order', () => {
    const all = [...STRENGTH_A_SLUGS, ...STRENGTH_B_SLUGS].map((slug) =>
      exercise({ slug }),
    );
    // Shuffle so ordering is proven, not incidental.
    const groups = groupCatalogueExercises([...all].reverse());

    expect(groups.map((group) => group.key)).toEqual([
      'strength-a',
      'strength-b',
    ]);
    expect(groups[0]?.exercises.map((e) => e.slug)).toEqual([
      ...STRENGTH_A_SLUGS,
    ]);
    expect(groups[1]?.exercises.map((e) => e.slug)).toEqual([
      ...STRENGTH_B_SLUGS,
    ]);
  });

  it('omits empty groups', () => {
    const groups = groupCatalogueExercises(
      STRENGTH_A_SLUGS.map((slug) => exercise({ slug })),
    );
    expect(groups.map((group) => group.key)).toEqual(['strength-a']);
  });

  it('collects exercises in neither session into an "Other exercises" group, sorted by name', () => {
    const groups = groupCatalogueExercises([
      exercise({ name: 'Zebra pose', slug: 'zebra' }),
      exercise({ name: 'Aardvark hold', slug: 'aardvark' }),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.key).toBe('other');
    expect(groups[0]?.exercises.map((e) => e.name)).toEqual([
      'Aardvark hold',
      'Zebra pose',
    ]);
  });

  it('returns nothing for an empty catalogue', () => {
    expect(groupCatalogueExercises([])).toEqual([]);
  });
});

describe('buildGuideSections', () => {
  it('returns the seven sections in screen order when all are populated', () => {
    const sections = buildGuideSections(exercise({ slug: 'leg-press' }));
    expect(sections.map((section) => section.key)).toEqual([
      'equipment-setup',
      'starting-position',
      'movement',
      'breathing',
      'common-mistakes',
      'stop-criteria',
      'approved-alternatives',
    ]);
  });

  it('omits sections whose content is missing or blank, showing no empty heading', () => {
    const sections = buildGuideSections(
      exercise({
        breathing: null,
        slug: 'leg-press',
        startingPosition: '   ',
      }),
    );
    const keys = sections.map((section) => section.key);
    expect(keys).not.toContain('starting-position');
    expect(keys).not.toContain('breathing');
    expect(keys).toContain('equipment-setup');
    expect(keys).toContain('stop-criteria');
  });

  it('trims section bodies', () => {
    const [first] = buildGuideSections(
      exercise({
        breathing: null,
        commonMistakes: null,
        equipmentSetup: '  Set the seat  ',
        movement: null,
        slug: 'leg-press',
        startingPosition: null,
        stopCriteria: null,
        approvedAlternatives: null,
      }),
    );
    expect(first).toEqual({
      body: 'Set the seat',
      key: 'equipment-setup',
      title: 'Equipment setup',
    });
  });

  it('returns an empty list when nothing is populated', () => {
    const bare = buildGuideSections({
      approvedAlternatives: null,
      breathing: null,
      commonMistakes: null,
      equipmentSetup: null,
      movement: null,
      name: 'Bare',
      slug: 'bare',
      startingPosition: null,
      stopCriteria: null,
    });
    expect(bare).toEqual([]);
  });
});
