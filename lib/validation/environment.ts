import { z } from 'zod';

const publicKeySchema = z.preprocess(
  (value) => value ?? '',
  z
    .string()
    .trim()
    .min(20, 'The Supabase publishable key is missing or too short.')
    .refine(
      (key) => !isSecretSupabaseKey(key),
      'A private Supabase key cannot be used in the mobile application.',
    ),
);

const environmentSchema = z.object({
  publishableKey: publicKeySchema,
  url: z.preprocess(
    (value) => value ?? '',
    z
      .url('The Supabase URL must be a valid URL.')
      .refine(
        isPermittedSupabaseUrl,
        'The Supabase URL must use HTTPS, except for local development.',
      ),
  ),
});

export type SupabaseEnvironment = z.infer<typeof environmentSchema>;
export type SupabaseEnvironmentState =
  | { status: 'configured'; value: SupabaseEnvironment }
  | { issues: readonly string[]; status: 'configuration_error' };

export type RawSupabaseEnvironment = {
  publishableKey: string | undefined;
  url: string | undefined;
};

export function validateSupabaseEnvironment(
  raw: RawSupabaseEnvironment,
): SupabaseEnvironmentState {
  const result = environmentSchema.safeParse(raw);

  if (result.success) {
    return { status: 'configured', value: result.data };
  }

  return {
    issues: [...new Set(result.error.issues.map(({ message }) => message))],
    status: 'configuration_error',
  };
}

export const supabaseEnvironment = validateSupabaseEnvironment({
  publishableKey: process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  url: process.env.EXPO_PUBLIC_SUPABASE_URL,
});

function isPermittedSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const isLocal = ['127.0.0.1', 'localhost'].includes(url.hostname);
    return url.protocol === 'https:' || (isLocal && url.protocol === 'http:');
  } catch {
    return false;
  }
}

function isSecretSupabaseKey(key: string): boolean {
  if (/^sb_secret_/i.test(key) || /service[_-]?role/i.test(key)) {
    return true;
  }

  const payload = key.split('.')[1];
  if (!payload) {
    return false;
  }

  try {
    const normalisedPayload = payload
      .replaceAll('-', '+')
      .replaceAll('_', '/')
      .padEnd(Math.ceil(payload.length / 4) * 4, '=');
    const claims: unknown = JSON.parse(globalThis.atob(normalisedPayload));
    return (
      z.object({ role: z.string().optional() }).parse(claims).role ===
      'service_role'
    );
  } catch {
    return false;
  }
}
