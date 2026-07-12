// The app-wide workout player repository, wired to the real Supabase client and
// the platform's local store (SQLite on device, in-memory on web). Null when
// Supabase is not configured, mirroring the auth, onboarding, plan and today
// defaults, so the player degrades gracefully instead of throwing. Tests inject
// their own repository and store and never touch this instance — so the SQLite
// store (and expo-sqlite) is only ever loaded here, at runtime on a device.

import { createActiveWorkoutStore } from '@/lib/persistence/createActiveWorkoutStore';
import { supabase } from '@/lib/supabase';

import {
  createSupabaseWorkoutPlayerBackend,
  createWorkoutPlayerRepository,
  type WorkoutPlayerRepository,
} from './workoutPlayerRepository';

export const defaultWorkoutPlayerRepository: WorkoutPlayerRepository | null =
  supabase
    ? createWorkoutPlayerRepository({
        backend: createSupabaseWorkoutPlayerBackend(supabase),
        store: createActiveWorkoutStore(),
      })
    : null;
