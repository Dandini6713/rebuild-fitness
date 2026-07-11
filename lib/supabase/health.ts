import { SupabaseEnvironmentState } from '@/lib/validation/environment';

export type SupabaseHealth =
  | { message: string; status: 'healthy' }
  | { message: string; status: 'setup_required' | 'unavailable' };

type HealthFetch = (
  input: string,
  init: { headers: { apikey: string }; method: 'GET'; signal: AbortSignal },
) => Promise<{ ok: boolean }>;

export async function checkSupabaseConnection(
  environment: SupabaseEnvironmentState,
  healthFetch: HealthFetch = fetch,
): Promise<SupabaseHealth> {
  if (environment.status === 'configuration_error') {
    return { message: 'Add the public Supabase configuration to check the connection.', status: 'setup_required' };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await healthFetch(`${environment.value.url}/auth/v1/health`, {
      headers: { apikey: environment.value.publishableKey },
      method: 'GET',
      signal: controller.signal,
    });

    return response.ok
      ? { message: 'Supabase is reachable.', status: 'healthy' }
      : { message: 'Supabase could not be reached. Check the project configuration.', status: 'unavailable' };
  } catch {
    return { message: 'Supabase could not be reached. Check your connection and try again.', status: 'unavailable' };
  } finally {
    clearTimeout(timeout);
  }
}
