import { SupabaseEnvironmentState } from '@/lib/validation/environment';

export type SupabaseClientState<Client> =
  | { client: Client; status: 'ready' }
  | { issues: readonly string[]; status: 'configuration_error' };

type ClientFactory<Client> = (url: string, publishableKey: string) => Client;

export function initialiseSupabaseClient<Client>(
  environment: SupabaseEnvironmentState,
  createClient: ClientFactory<Client>,
): SupabaseClientState<Client> {
  if (environment.status === 'configuration_error') {
    return environment;
  }

  return {
    client: createClient(environment.value.url, environment.value.publishableKey),
    status: 'ready',
  };
}
