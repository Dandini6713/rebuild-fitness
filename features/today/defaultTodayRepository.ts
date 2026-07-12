// The app-wide Today repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the auth, onboarding and plan defaults), so
// the Today screen degrades gracefully instead of throwing. Tests inject their own
// repository and never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createSupabaseTodayBackend,
  createTodayRepository,
  type TodayRepository,
} from './todayRepository';

export const defaultTodayRepository: TodayRepository | null = supabase
  ? createTodayRepository(createSupabaseTodayBackend(supabase))
  : null;
