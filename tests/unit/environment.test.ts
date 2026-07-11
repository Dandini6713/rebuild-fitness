import { describe, expect, it } from '@jest/globals';

import { validateSupabaseEnvironment } from '@/lib/validation/environment';

const validEnvironment = {
  publishableKey: 'sb_publishable_12345678901234567890',
  url: 'https://example.supabase.co',
};

describe('Supabase environment validation', () => {
  it('accepts a hosted URL and publishable key', () => {
    expect(validateSupabaseEnvironment(validEnvironment)).toEqual({
      status: 'configured',
      value: validEnvironment,
    });
  });

  it('accepts HTTP only for local development', () => {
    expect(
      validateSupabaseEnvironment({
        ...validEnvironment,
        url: 'http://127.0.0.1:54321',
      }).status,
    ).toBe('configured');
    expect(
      validateSupabaseEnvironment({
        ...validEnvironment,
        url: 'http://example.com',
      }).status,
    ).toBe('configuration_error');
  });

  it('returns a safe configuration error when variables are missing', () => {
    const result = validateSupabaseEnvironment({
      publishableKey: undefined,
      url: undefined,
    });

    expect(result.status).toBe('configuration_error');
    if (result.status === 'configuration_error') {
      expect(result.issues.length).toBeGreaterThan(0);
      expect(result.issues.join(' ')).not.toContain('undefined');
    }
  });

  it('rejects current secret keys and legacy service-role JWTs', () => {
    const serviceRolePayload = globalThis.btoa(
      JSON.stringify({ role: 'service_role' }),
    );
    const serviceRoleJwt = `e30.${serviceRolePayload}.signature`;

    expect(
      validateSupabaseEnvironment({
        ...validEnvironment,
        publishableKey: 'sb_secret_12345678901234567890',
      }).status,
    ).toBe('configuration_error');
    expect(
      validateSupabaseEnvironment({
        ...validEnvironment,
        publishableKey: serviceRoleJwt,
      }).status,
    ).toBe('configuration_error');
  });
});
