import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { ErrorState, LoadingState, OfflineState } from '@/components/common';

describe('LoadingState', () => {
  it('announces itself as a busy progress indicator with text', async () => {
    const { getByLabelText } = await render(
      <LoadingState
        description="Loading your plan…"
        label="Loading your plan"
      />,
    );

    const region = getByLabelText('Loading your plan');
    expect(region.props.accessibilityRole).toBe('progressbar');
    expect(region.props.accessibilityState).toEqual({ busy: true });
  });

  it('falls back to the label when no description is given', async () => {
    const { getByText } = await render(
      <LoadingState label="Loading your plan" />,
    );
    expect(getByText('Loading your plan')).toBeOnTheScreen();
  });
});

describe('ErrorState', () => {
  it('conveys status with an icon and text, not colour alone', async () => {
    const { getByText } = await render(
      <ErrorState
        description="Check your connection and try again."
        title="Can't load your plan"
      />,
    );

    // StatusBadge renders the caution symbol '!' alongside the word.
    expect(getByText('! Error')).toBeOnTheScreen();
    expect(getByText("Can't load your plan")).toBeOnTheScreen();
    expect(getByText('Check your connection and try again.')).toBeOnTheScreen();
  });

  it('is announced assertively as an alert', async () => {
    const { getByLabelText } = await render(
      <ErrorState description="Something failed." title="Problem" />,
    );

    const alert = getByLabelText('Problem. Something failed.');
    expect(alert.props.accessibilityRole).toBe('alert');
  });

  it('offers a retry action when a handler is provided', async () => {
    const onRetry = jest.fn();
    const { getByRole } = await render(
      <ErrorState description="Failed." onRetry={onRetry} />,
    );

    fireEvent.press(getByRole('button', { name: 'Try again' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('omits the retry action when no handler is provided', async () => {
    const { queryByRole } = await render(<ErrorState description="Failed." />);
    expect(queryByRole('button')).toBeNull();
  });
});

describe('OfflineState', () => {
  it('shows default British copy with an offline status icon', async () => {
    const { getByText } = await render(<OfflineState />);

    expect(getByText('i Offline')).toBeOnTheScreen();
    expect(getByText('You appear to be offline')).toBeOnTheScreen();
  });

  it('accepts an overriding description', async () => {
    const { getByText, getByLabelText } = await render(
      <OfflineState description="Your plan will load here once you are back online." />,
    );

    expect(
      getByText('Your plan will load here once you are back online.'),
    ).toBeOnTheScreen();
    expect(
      getByLabelText(
        'You appear to be offline. Your plan will load here once you are back online.',
      ),
    ).toBeOnTheScreen();
  });
});
