export type AuthStatus =
  'loading' | 'authenticated' | 'unauthenticated' | 'configuration_error';

export function getAuthGuards(status: AuthStatus) {
  return {
    allowPrivate: status === 'authenticated',
    allowPublic:
      status === 'unauthenticated' || status === 'configuration_error',
  };
}
