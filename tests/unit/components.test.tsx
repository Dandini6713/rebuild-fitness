import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { PrimaryButton, ProgressBar, StatusBadge } from '@/components/common';

describe('shared components', () => {
  it('gives buttons an accessible name and invokes their action', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton label="Continue" onPress={onPress} />,
    );

    const button = getByRole('button', { name: 'Continue' });
    fireEvent.press(button);

    expect(onPress).toHaveBeenCalledTimes(1);
    expect(button.props.accessibilityState).toEqual({
      busy: false,
      disabled: false,
    });
  });

  it('prevents disabled buttons from invoking their action', async () => {
    const onPress = jest.fn();
    const { getByRole } = await render(
      <PrimaryButton disabled label="Continue" onPress={onPress} />,
    );

    fireEvent.press(getByRole('button', { name: 'Continue' }));

    expect(onPress).not.toHaveBeenCalled();
  });

  it('clamps progress values and exposes a spoken percentage', async () => {
    const { getByLabelText } = await render(
      <ProgressBar accessibilityLabel="Weekly progress" value={125} />,
    );

    const progress = getByLabelText('Weekly progress');
    expect(progress.props.accessibilityRole).toBe('progressbar');
    expect(progress.props.accessibilityValue).toEqual({
      max: 100,
      min: 0,
      now: 100,
      text: '100 per cent',
    });
  });

  it('communicates status with words as well as colour', async () => {
    const { getByLabelText, getByText } = await render(
      <StatusBadge label="Needs attention" tone="caution" />,
    );

    expect(getByLabelText('Needs attention, caution status')).toBeOnTheScreen();
    expect(getByText('! Needs attention')).toBeOnTheScreen();
  });
});
