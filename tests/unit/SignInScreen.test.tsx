import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { SignInScreen } from '@/features/auth/SignInScreen';

const mockAuth = {
  signIn: jest.fn(async () => ({
    message: 'We could not sign you in. Check your details and try again.',
    success: false as const,
  })),
  status: 'unauthenticated' as 'unauthenticated' | 'configuration_error',
};
const mockUseAuth = jest.fn(() => mockAuth);

jest.mock('@/features/auth/AuthProvider', () => ({
  useAuth: () => mockUseAuth(),
}));

describe('SignInScreen', () => {
  it('validates fields before calling Supabase', async () => {
    mockAuth.status = 'unauthenticated';
    mockAuth.signIn.mockClear();
    mockUseAuth.mockReturnValue(mockAuth);
    const view = await render(<SignInScreen />);

    await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(view.getByText('Enter a valid email address.')).toBeOnTheScreen();
      expect(view.getByText('Enter your password.')).toBeOnTheScreen();
    });
    expect(mockAuth.signIn).not.toHaveBeenCalled();
  });

  it('submits normalised credentials and shows a generic failure', async () => {
    mockAuth.status = 'unauthenticated';
    mockAuth.signIn.mockClear();
    mockUseAuth.mockReturnValue(mockAuth);
    const view = await render(<SignInScreen />);
    await fireEvent.changeText(
      view.getByLabelText('Email address'),
      ' Danny@Example.COM ',
    );
    await fireEvent.changeText(view.getByLabelText('Password'), 'secret');

    await fireEvent.press(view.getByRole('button', { name: 'Sign in' }));

    await waitFor(() => {
      expect(mockAuth.signIn).toHaveBeenCalledWith(
        'danny@example.com',
        'secret',
      );
      expect(
        view.getByText(
          'We could not sign you in. Check your details and try again.',
        ),
      ).toBeOnTheScreen();
    });
  });

  it('disables sign-in safely when Supabase is not configured', async () => {
    mockAuth.status = 'configuration_error';
    mockUseAuth.mockReturnValue(mockAuth);
    const view = await render(<SignInScreen />);

    expect(
      view.getByLabelText('Setup required, caution status'),
    ).toBeOnTheScreen();
    expect(
      view.getByRole('button', { name: 'Sign in' }).props.accessibilityState
        .disabled,
    ).toBe(true);
  });
});
