// The app-wide cardio player repository, wired to the real Supabase client and the
// platform's local store (SQLite on device, in-memory on web). Null when Supabase is
// not configured, mirroring the workout, today, plan and auth defaults, so the
// player degrades gracefully instead of throwing. Tests inject their own repository,
// store and cue adapter and never touch this instance — so the SQLite store (and
// expo-sqlite) is only ever loaded here, at runtime on a device.

import { createActiveCardioStore } from '@/lib/persistence/createActiveCardioStore';
import { supabase } from '@/lib/supabase';

import {
  type CardioPlayerRepository,
  createCardioPlayerRepository,
  createSupabaseCardioPlayerBackend,
} from './cardioPlayerRepository';

export const defaultCardioPlayerRepository: CardioPlayerRepository | null =
  supabase
    ? createCardioPlayerRepository({
        backend: createSupabaseCardioPlayerBackend(supabase),
        store: createActiveCardioStore(),
      })
    : null;
