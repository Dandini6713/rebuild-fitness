import { describe, expect, it } from '@jest/globals';

import { validateSignIn } from '@/features/auth/authValidation';

describe('sign-in validation', () => {
  it('normalises a valid email address', () => {
    expect(
      validateSignIn({
        email: '  Danny@Example.COM ',
        password: 'private password',
      }),
    ).toEqual({
      data: { email: 'danny@example.com', password: 'private password' },
      success: true,
    });
  });

  it('returns field errors without echoing credentials', () => {
    const result = validateSignIn({ email: 'not-an-email', password: '' });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.fieldErrors.email).toBeDefined();
      expect(result.fieldErrors.password).toBeDefined();
      expect(JSON.stringify(result)).not.toContain('not-an-email');
    }
  });
});
