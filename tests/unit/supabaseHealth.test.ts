import { describe, expect, it, jest } from '@jest/globals';

import { checkSupabaseConnection } from '@/lib/supabase/health';
import { SupabaseEnvironmentState } from '@/lib/validation/environment';

describe('Supabase connection health', () => {
  it('does not make a request without valid public configuration', async () => {
    const fetcher = jest.fn(async (_input: string, _init: object) => ({
      ok: true,
    }));

    const result = await checkSupabaseConnection(
      { issues: ['Configuration missing.'], status: 'configuration_error' },
      fetcher,
    );

    expect(result.status).toBe('setup_required');
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('checks only the health endpoint and returns no response data', async () => {
    const environment: SupabaseEnvironmentState = {
      status: 'configured',
      value: {
        publishableKey: 'sb_publishable_12345678901234567890',
        url: 'https://example.supabase.co',
      },
    };
    const fetcher = jest.fn(async (_input: string, _init: object) => ({
      ok: true,
    }));

    await expect(
      checkSupabaseConnection(environment, fetcher),
    ).resolves.toEqual({
      message: 'Supabase is reachable.',
      status: 'healthy',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls[0]?.[0]).toBe(
      'https://example.supabase.co/auth/v1/health',
    );
  });
});
