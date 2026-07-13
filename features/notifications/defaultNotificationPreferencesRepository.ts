// The app-wide notification-preferences repository, wired to the real Supabase client.
// Null when Supabase is not configured (mirrors the other feature defaults), so the
// settings screen degrades gracefully instead of throwing. Tests inject their own
// repository and never touch this instance.

import { supabase } from '@/lib/supabase';

import {
  type NotificationPreferencesRepository,
  createNotificationPreferencesRepository,
  createSupabaseNotificationPreferencesBackend,
} from './notificationPreferencesRepository';

export const defaultNotificationPreferencesRepository: NotificationPreferencesRepository | null =
  supabase
    ? createNotificationPreferencesRepository(
        createSupabaseNotificationPreferencesBackend(supabase),
      )
    : null;
