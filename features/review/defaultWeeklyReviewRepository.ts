// The app-wide weekly-review repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the alcohol/nutrition/measurements defaults), so the
// screens degrade gracefully instead of throwing. Tests inject their own repository and
// never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createSupabaseWeeklyReviewBackend,
  createWeeklyReviewRepository,
  type WeeklyReviewRepository,
} from './weeklyReviewRepository';

export const defaultWeeklyReviewRepository: WeeklyReviewRepository | null =
  supabase
    ? createWeeklyReviewRepository(createSupabaseWeeklyReviewBackend(supabase))
    : null;
