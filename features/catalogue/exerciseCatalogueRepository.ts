// Server boundary for the exercise catalogue (roadmap 10, S-013). Mirrors
// features/plan/planRepository.ts: a narrow backend interface keeps the
// composition logic testable, and a Supabase adapter implements it against the
// `exercises` table.
//
// Unlike the plan and today reads, the catalogue is shared reference data, not
// user-owned. The RLS migration exposes it read-only to any signed-in user
// ("authenticated catalogue read" — for select to authenticated using (true),
// plus grant select on public.exercises to authenticated), so there is no owner
// scoping here: every authenticated user sees the same curated rows. Writes are
// out of scope; the client only reads.

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  buildGuideSections,
  type CatalogueExercise,
  type CatalogueGroup,
  groupCatalogueExercises,
  type GuideSection,
} from '@/domain/training/exerciseCatalogue';
import type { Database } from '@/lib/supabase';

type BackendError = { message: string } | null;

// The guide fields, selected explicitly so the shape is auditable and the mapper
// below stays honest if the table grows more columns.
type RawExercise = {
  slug: string;
  name: string;
  beginner_setup: string | null;
  starting_position: string | null;
  execution_steps: string | null;
  breathing: string | null;
  common_mistakes: string | null;
  stop_criteria: string | null;
  substitution_options: string | null;
};

const EXERCISE_COLUMNS =
  'slug, name, beginner_setup, starting_position, execution_steps, breathing, common_mistakes, stop_criteria, substitution_options';

export type CatalogueBackend = {
  fetchExercises(): Promise<{
    data: RawExercise[] | null;
    error: BackendError;
  }>;
  fetchExercise(
    slug: string,
  ): Promise<{ data: RawExercise | null; error: BackendError }>;
};

export type CatalogueResult =
  | { status: 'ready'; groups: CatalogueGroup[] }
  | { status: 'empty' }
  | { status: 'error'; message: string };

// A resolved guide: the exercise's display name plus its populated sections in
// screen order. `not-found` is distinct from `error` so a mistyped or retired
// slug reads as "we don't have that exercise", not "something went wrong".
export type GuideResult =
  | { status: 'ready'; name: string; sections: GuideSection[] }
  | { status: 'not-found' }
  | { status: 'error'; message: string };

function toCatalogueExercise(raw: RawExercise): CatalogueExercise {
  return {
    approvedAlternatives: raw.substitution_options,
    breathing: raw.breathing,
    commonMistakes: raw.common_mistakes,
    equipmentSetup: raw.beginner_setup,
    movement: raw.execution_steps,
    name: raw.name,
    slug: raw.slug,
    startingPosition: raw.starting_position,
    stopCriteria: raw.stop_criteria,
  };
}

export function createSupabaseCatalogueBackend(
  client: SupabaseClient<Database>,
): CatalogueBackend {
  return {
    async fetchExercises() {
      const { data, error } = await client
        .from('exercises')
        .select(EXERCISE_COLUMNS)
        .eq('active', true)
        .order('name', { ascending: true });
      return { data: data as RawExercise[] | null, error };
    },

    async fetchExercise(slug) {
      const { data, error } = await client
        .from('exercises')
        .select(EXERCISE_COLUMNS)
        .eq('slug', slug)
        .eq('active', true)
        .maybeSingle();
      return { data: (data as RawExercise | null) ?? null, error };
    },
  };
}

const READ_ERROR =
  'We could not load the exercise guide. Check your connection and try again.';

export function createCatalogueRepository(backend: CatalogueBackend) {
  return {
    async loadCatalogue(): Promise<CatalogueResult> {
      const { data, error } = await backend.fetchExercises();
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      const exercises = (data ?? []).map(toCatalogueExercise);
      if (exercises.length === 0) {
        return { status: 'empty' };
      }
      return { groups: groupCatalogueExercises(exercises), status: 'ready' };
    },

    async loadGuide(slug: string): Promise<GuideResult> {
      const { data, error } = await backend.fetchExercise(slug);
      if (error) {
        return { message: READ_ERROR, status: 'error' };
      }
      if (!data) {
        return { status: 'not-found' };
      }
      const exercise = toCatalogueExercise(data);
      return {
        name: exercise.name,
        sections: buildGuideSections(exercise),
        status: 'ready',
      };
    },
  };
}

export type CatalogueRepository = ReturnType<typeof createCatalogueRepository>;
