import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { ConfirmationStep } from '@/features/onboarding/steps/ConfirmationStep';

const mockState = {
  draft: {
    achilles: {
      calfRaiseCapability: 'comfortable',
      painStiffness: 'none',
      previousInjuryAcknowledged: true,
      professionalRestrictions: '',
      walkingTolerance: 'unrestricted',
    },
    currentStepId: 'confirm',
    goals: {
      currentWeightKg: 90,
      heightCm: 183,
      mainObjective: 'lose_fat',
      preferredRate: 'steady',
      targetWeightKg: 84,
      waistCm: 96,
    },
    version: 1,
  } as Record<string, unknown>,
  goBack: jest.fn(),
  submit: jest.fn(
    async () => ({ success: true }) as { success: boolean; message?: string },
  ),
  submitting: false,
};

jest.mock('@/features/onboarding/OnboardingProvider', () => ({
  useOnboarding: () => mockState,
}));

describe('ConfirmationStep (S-005)', () => {
  it('handles the not-yet-seeded plan without rendering weeks', async () => {
    const view = await render(<ConfirmationStep />);
    // Plan seeding is roadmap 06; the screen captures confirmation only.
    expect(view.getByText('Your plan is on its way')).toBeOnTheScreen();
  });

  it('guards against missing answers instead of submitting a partial profile', async () => {
    const original = mockState.draft;
    mockState.draft = { currentStepId: 'confirm', version: 1 };
    const view = await render(<ConfirmationStep />);
    expect(view.getByText('A few answers are missing')).toBeOnTheScreen();
    mockState.draft = original;
  });

  it('surfaces a submission failure with an error message', async () => {
    mockState.submit.mockResolvedValueOnce({
      message:
        'We could not save your setup. Check your connection and try again.',
      success: false,
    });
    const view = await render(<ConfirmationStep />);

    await fireEvent.press(
      view.getByRole('button', { name: 'Confirm and continue' }),
    );

    await waitFor(() => {
      expect(mockState.submit).toHaveBeenCalled();
      expect(
        view.getByText(
          'We could not save your setup. Check your connection and try again.',
        ),
      ).toBeOnTheScreen();
    });
  });
});
