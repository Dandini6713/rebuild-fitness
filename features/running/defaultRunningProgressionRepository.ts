// The app-wide running progression repository, wired to the real Supabase client.
// Null when Supabase is not configured, mirroring the workout, cardio, today and plan
// defaults, so the surface degrades gracefully instead of throwing. Tests inject their
// own repository and never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createRunningProgressionRepository,
  createSupabaseRunningProgressionBackend,
  type RunningProgressionRepository,
} from './runningProgressionRepository';

export const defaultRunningProgressionRepository: RunningProgressionRepository | null =
  supabase
    ? createRunningProgressionRepository({
        backend: createSupabaseRunningProgressionBackend(supabase),
      })
    : null;
