// The app-wide progress-dashboard repository, wired to the real Supabase client. Null
// when Supabase is not configured (mirrors the other feature defaults), so the Progress
// screen degrades gracefully instead of throwing. Tests inject their own repository and
// never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createProgressDashboardRepository,
  createSupabaseProgressBackend,
  type ProgressDashboardRepository,
} from './progressDashboardRepository';

export const defaultProgressDashboardRepository: ProgressDashboardRepository | null =
  supabase
    ? createProgressDashboardRepository(createSupabaseProgressBackend(supabase))
    : null;
