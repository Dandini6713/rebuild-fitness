// Pure shaping for the exercise catalogue and the S-013 Exercise guide. The
// catalogue rows are shared reference data (the `exercises` table, readable by any
// authenticated user under RLS); this module owns the two decisions made around
// them: how the catalogue is grouped for browsing, and how one exercise's stored
// fields become the guide's ordered sections. No React and no I/O, so it is safe
// to unit test in isolation, mirroring planSchedule.ts and replacementOptions.ts.

// The typed shape a fetched exercise row is mapped to before shaping. Only the
// fields the catalogue list and the guide need; kept independent of the raw
// database row so the repository owns the mapping.
export type CatalogueExercise = {
  slug: string;
  name: string;
  // Section content, each optional because the guide omits an absent section
  // rather than showing an empty heading.
  equipmentSetup: string | null;
  startingPosition: string | null;
  movement: string | null;
  breathing: string | null;
  commonMistakes: string | null;
  stopCriteria: string | null;
  approvedAlternatives: string | null;
};

// The two persona strength sessions, in the exact exercise order the seed lays
// down. Kept in lockstep with seed_private_plan (migration 20260711090600) and the
// reference at the bottom of supabase/seed.sql, which remain the source of truth
// for what a session actually contains. Encoded here by slug so the catalogue can
// be grouped from the shared `exercises` table alone, without needing a seeded
// per-user plan to exist yet.
export const STRENGTH_A_SLUGS = [
  'leg-press',
  'machine-chest-press',
  'seated-cable-row',
  'dumbbell-rdl',
  'standing-calf-raise',
  'dead-bug',
] as const;

export const STRENGTH_B_SLUGS = [
  'low-step-up',
  'lat-pulldown',
  'machine-shoulder-press',
  'glute-bridge',
  'seated-calf-raise',
  'farmer-carry',
] as const;

export type CatalogueGroup = {
  key: string;
  title: string;
  exercises: CatalogueExercise[];
};

// Orders a set of exercises by a canonical slug list, dropping any the list does
// not mention. Preserves the persona session order rather than sorting by name.
function orderBySlugs(
  exercises: readonly CatalogueExercise[],
  slugs: readonly string[],
): CatalogueExercise[] {
  const bySlug = new Map(
    exercises.map((exercise) => [exercise.slug, exercise]),
  );
  return slugs
    .map((slug) => bySlug.get(slug))
    .filter(
      (exercise): exercise is CatalogueExercise => exercise !== undefined,
    );
}

// Groups the catalogue into the two strength sessions for browsing, in session
// order. Anything not in either session (none of the seeded twelve today, but the
// schema can grow) falls into a final "Other exercises" group so nothing is ever
// silently dropped. Empty groups are omitted.
export function groupCatalogueExercises(
  exercises: readonly CatalogueExercise[],
): CatalogueGroup[] {
  const known = new Set<string>([...STRENGTH_A_SLUGS, ...STRENGTH_B_SLUGS]);
  const groups: CatalogueGroup[] = [
    {
      exercises: orderBySlugs(exercises, STRENGTH_A_SLUGS),
      key: 'strength-a',
      title: 'Strength A',
    },
    {
      exercises: orderBySlugs(exercises, STRENGTH_B_SLUGS),
      key: 'strength-b',
      title: 'Strength B',
    },
    {
      exercises: exercises
        .filter((exercise) => !known.has(exercise.slug))
        .sort((a, b) => a.name.localeCompare(b.name)),
      key: 'other',
      title: 'Other exercises',
    },
  ];
  return groups.filter((group) => group.exercises.length > 0);
}

// The seven S-013 sections, in the order the screen shows them. `key` lets the
// view treat stop-criteria specially (safety presentation) without matching on
// the human title.
export type GuideSectionKey =
  | 'equipment-setup'
  | 'starting-position'
  | 'movement'
  | 'breathing'
  | 'common-mistakes'
  | 'stop-criteria'
  | 'approved-alternatives';

export type GuideSection = {
  key: GuideSectionKey;
  title: string;
  body: string;
};

const SECTION_ORDER: {
  key: GuideSectionKey;
  title: string;
  field: keyof CatalogueExercise;
}[] = [
  { field: 'equipmentSetup', key: 'equipment-setup', title: 'Equipment setup' },
  {
    field: 'startingPosition',
    key: 'starting-position',
    title: 'Starting position',
  },
  { field: 'movement', key: 'movement', title: 'Movement' },
  { field: 'breathing', key: 'breathing', title: 'Breathing' },
  { field: 'commonMistakes', key: 'common-mistakes', title: 'Common mistakes' },
  { field: 'stopCriteria', key: 'stop-criteria', title: 'Stop criteria' },
  {
    field: 'approvedAlternatives',
    key: 'approved-alternatives',
    title: 'Approved alternatives',
  },
];

// Builds the guide's sections from an exercise, in screen order, omitting any
// whose stored content is missing or blank. Returning only populated sections is
// what lets the screen degrade gracefully: an exercise with no breathing note
// simply has no breathing heading.
export function buildGuideSections(
  exercise: CatalogueExercise,
): GuideSection[] {
  return SECTION_ORDER.flatMap(({ field, key, title }) => {
    const value = exercise[field];
    if (typeof value !== 'string') {
      return [];
    }
    const body = value.trim();
    if (body.length === 0) {
      return [];
    }
    return [{ body, key, title }];
  });
}
