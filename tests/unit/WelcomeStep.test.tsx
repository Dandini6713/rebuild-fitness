import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { WelcomeStep } from '@/features/onboarding/steps/WelcomeStep';

const mockGoTo = jest.fn();

jest.mock('@/features/onboarding/OnboardingProvider', () => ({
  useOnboarding: () => ({ goTo: mockGoTo }),
}));

describe('WelcomeStep (S-001)', () => {
  it('shows the product promise and no account-creation action', async () => {
    const view = await render(<WelcomeStep />);
    expect(
      view.getByText('Your training, food and recovery plan in one place.'),
    ).toBeOnTheScreen();
    // Private beta: onboarding runs after sign-in, so there is no sign-up.
    expect(view.queryByText('Create account')).toBeNull();
  });

  it('begins setup by moving to the goals step', async () => {
    mockGoTo.mockClear();
    const view = await render(<WelcomeStep />);
    await fireEvent.press(view.getByRole('button', { name: 'Begin setup' }));
    expect(mockGoTo).toHaveBeenCalledWith('goals');
  });
});
