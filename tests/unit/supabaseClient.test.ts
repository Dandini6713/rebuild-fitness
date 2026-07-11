import { describe, expect, it, jest } from '@jest/globals';

import { initialiseSupabaseClient } from '@/lib/supabase/clientFactory';
import { SupabaseEnvironmentState } from '@/lib/validation/environment';

const configured: SupabaseEnvironmentState = {
  status: 'configured',
  value: {
    publishableKey: 'sb_publishable_12345678901234567890',
    url: 'https://example.supabase.co',
  },
};

describe('Supabase client initialisation', () => {
  it('creates one client for valid configuration', () => {
    const client = { name: 'shared-client' };
    const createClient = jest.fn(() => client);

    expect(initialiseSupabaseClient(configured, createClient)).toEqual({
      client,
      status: 'ready',
    });
    expect(createClient).toHaveBeenCalledTimes(1);
    expect(createClient).toHaveBeenCalledWith(
      'https://example.supabase.co',
      'sb_publishable_12345678901234567890',
    );
  });

  it('does not call the client library when configuration is invalid', () => {
    const environment: SupabaseEnvironmentState = {
      issues: ['Public configuration is missing.'],
      status: 'configuration_error',
    };
    const createClient = jest.fn(() => ({ name: 'unexpected' }));

    expect(initialiseSupabaseClient(environment, createClient)).toEqual(
      environment,
    );
    expect(createClient).not.toHaveBeenCalled();
  });
});
