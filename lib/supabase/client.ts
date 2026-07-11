import 'react-native-url-polyfill/auto';
import 'expo-sqlite/localStorage/install';

import { createClient, SupabaseClient } from '@supabase/supabase-js';

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
        persistSession: true,
        storage: globalThis.localStorage,
      },
    }),
);

export const supabase = supabaseState.status === 'ready' ? supabaseState.client : null;
