// The app-wide nutrition repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the today/measurements defaults), so the screens
// degrade gracefully instead of throwing. Tests inject their own repository and never
// touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createNutritionRepository,
  createSupabaseNutritionBackend,
  type NutritionRepository,
} from './nutritionRepository';

export const defaultNutritionRepository: NutritionRepository | null = supabase
  ? createNutritionRepository(createSupabaseNutritionBackend(supabase))
  : null;
