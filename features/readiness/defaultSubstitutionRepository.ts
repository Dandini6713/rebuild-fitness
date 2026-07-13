// The app-wide substitution repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the readiness/today/plan defaults), so the amber
// offer degrades gracefully instead of throwing. Tests inject their own repository and
// never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createSubstitutionRepository,
  createSupabaseSubstitutionBackend,
  type SubstitutionRepository,
} from './substitutionRepository';

export const defaultSubstitutionRepository: SubstitutionRepository | null =
  supabase
    ? createSubstitutionRepository(createSupabaseSubstitutionBackend(supabase))
    : null;
