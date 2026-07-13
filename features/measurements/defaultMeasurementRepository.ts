// The app-wide measurement repository, wired to the real Supabase client. Null when
// Supabase is not configured (mirrors the today/readiness defaults), so the screens
// degrade gracefully instead of throwing. Tests inject their own repository and never
// touch this instance.

import { supabase } from '@/lib/supabase';

import {
  createMeasurementRepository,
  createSupabaseMeasurementBackend,
  type MeasurementRepository,
} from './measurementRepository';

export const defaultMeasurementRepository: MeasurementRepository | null =
  supabase
    ? createMeasurementRepository(createSupabaseMeasurementBackend(supabase))
    : null;
