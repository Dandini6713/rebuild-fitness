// The app-wide catalogue repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the plan and today defaults), so the guide
// screens degrade to an "unavailable" state instead of throwing. Tests inject
// their own repository and never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  type CatalogueRepository,
  createCatalogueRepository,
  createSupabaseCatalogueBackend,
} from './exerciseCatalogueRepository';

export const defaultCatalogueRepository: CatalogueRepository | null = supabase
  ? createCatalogueRepository(createSupabaseCatalogueBackend(supabase))
  : null;
