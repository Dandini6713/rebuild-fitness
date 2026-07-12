// The app-wide plan repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the auth and onboarding defaults), so both
// the onboarding submission and the plan preview degrade gracefully instead of
// throwing. Tests inject their own repository and never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createPlanRepository,
  createSupabasePlanBackend,
  type PlanRepository,
} from './planRepository';

export const defaultPlanRepository: PlanRepository | null = supabase
  ? createPlanRepository(createSupabasePlanBackend(supabase))
  : null;
