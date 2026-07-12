// The app-wide readiness repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the today/plan/workout defaults), so the
// screen degrades gracefully instead of throwing. Tests inject their own repository
// and never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createReadinessRepository,
  createSupabaseReadinessBackend,
  type ReadinessRepository,
} from './readinessRepository';

export const defaultReadinessRepository: ReadinessRepository | null = supabase
  ? createReadinessRepository(createSupabaseReadinessBackend(supabase))
  : null;
