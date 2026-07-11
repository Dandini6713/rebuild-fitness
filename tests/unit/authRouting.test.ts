import { describe, expect, it } from '@jest/globals';

import { getAuthGuards } from '@/features/auth/authRouting';

describe('authentication route guards', () => {
  it('keeps every route hidden while the session is loading', () => {
    expect(getAuthGuards('loading')).toEqual({
      allowPrivate: false,
      allowPublic: false,
    });
  });

  it('allows only sign-in routes without a session', () => {
    expect(getAuthGuards('unauthenticated')).toEqual({
      allowPrivate: false,
      allowPublic: true,
    });
  });

  it('allows only private routes with a session', () => {
    expect(getAuthGuards('authenticated')).toEqual({
      allowPrivate: true,
      allowPublic: false,
    });
  });

  it('keeps the configuration-error screen public', () => {
    expect(getAuthGuards('configuration_error')).toEqual({
      allowPrivate: false,
      allowPublic: true,
    });
  });
});
