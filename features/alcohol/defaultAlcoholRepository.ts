// The app-wide alcohol repository, wired to the real Supabase client. Null when Supabase
// is not configured (mirrors the nutrition/measurements defaults), so the screens degrade
// gracefully instead of throwing. Tests inject their own repository and never touch this
// instance.

import { supabase } from '@/lib/supabase';

import {
  type AlcoholRepository,
  createAlcoholRepository,
  createSupabaseAlcoholBackend,
} from './alcoholRepository';

export const defaultAlcoholRepository: AlcoholRepository | null = supabase
  ? createAlcoholRepository(createSupabaseAlcoholBackend(supabase))
  : null;
