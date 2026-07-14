// The app-wide account repository, wired to the real Supabase client. Null when Supabase is
// not configured (mirrors the other feature defaults), so the S-053 screen degrades to an
// unavailable state instead of throwing. Tests inject their own repository and never touch
// this instance.

import { supabase } from '@/lib/supabase';

import {
  type AccountRepository,
  createAccountRepository,
  createSupabaseAccountBackend,
} from './accountRepository';

export const defaultAccountRepository: AccountRepository | null = supabase
  ? createAccountRepository(createSupabaseAccountBackend(supabase))
  : null;
