import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render, waitFor } from '@testing-library/react-native';

import { GoalsStep } from '@/features/onboarding/steps/GoalsStep';

const mockSaveStep = jest.fn(async () => {});
const mockGoBack = jest.fn();

jest.mock('@/features/onboarding/OnboardingProvider', () => ({
  useOnboarding: () => ({
    draft: { currentStepId: 'goals', version: 1 },
    goBack: mockGoBack,
    saveStep: mockSaveStep,
  }),
}));

describe('GoalsStep (S-002)', () => {
  it('shows validation messages and does not advance on empty input', async () => {
    mockSaveStep.mockClear();
    const view = await render(<GoalsStep />);

    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(
        view.getByText('Enter your height in centimetres.'),
      ).toBeOnTheScreen();
      expect(view.getByText('Choose your main objective.')).toBeOnTheScreen();
    });
    expect(mockSaveStep).not.toHaveBeenCalled();
  });

  it('saves typed measurements and advances to availability', async () => {
    mockSaveStep.mockClear();
    const view = await render(<GoalsStep />);

    await fireEvent.changeText(view.getByLabelText('Height (cm)'), '183');
    await fireEvent.changeText(
      view.getByLabelText('Current weight (kg)'),
      '90',
    );
    await fireEvent.changeText(view.getByLabelText('Waist (cm)'), '96');
    await fireEvent.changeText(view.getByLabelText('Target weight (kg)'), '84');
    await fireEvent.press(view.getByText('Lose body fat'));
    await fireEvent.press(view.getByText('Steady (about 0.5 kg a week)'));

    await fireEvent.press(view.getByRole('button', { name: 'Continue' }));

    await waitFor(() => {
      expect(mockSaveStep).toHaveBeenCalledWith(
        {
          goals: {
            currentWeightKg: 90,
            heightCm: 183,
            mainObjective: 'lose_fat',
            preferredRate: 'steady',
            targetWeightKg: 84,
            waistCm: 96,
          },
        },
        'availability',
      );
    });
  });
});
