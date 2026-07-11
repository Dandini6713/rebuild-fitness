import 'react-native-url-polyfill/auto';

import { createClient, processLock, SupabaseClient } from '@supabase/supabase-js';

import { authStorage } from '@/lib/auth/secureAuthStorage';
import { supabaseEnvironment } from '@/lib/validation/environment';

import { initialiseSupabaseClient } from './clientFactory';
import { Database } from './database.types';

export const supabaseState = initialiseSupabaseClient<SupabaseClient<Database>>(
  supabaseEnvironment,
  (url, publishableKey) =>
    createClient<Database>(url, publishableKey, {
      auth: {
        autoRefreshToken: true,
        detectSessionInUrl: false,
        lock: processLock,
        persistSession: true,
        storage: authStorage,
      },
    }),
);

export const supabase = supabaseState.status === 'ready' ? supabaseState.client : null;
