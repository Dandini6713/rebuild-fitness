// Roadmap 26 (accessibility): the shared form error SUMMARY (docs/09 §9.8 "Forms show
// errors next to the field AND in an accessible summary"). These assert the summary is a
// real, announced summary — an assertive alert whose label reads every error at once — and
// that it stays out of the way when the form is valid.

import { describe, expect, it } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { FormErrorSummary } from '@/components/forms';
import { MeasurementFormView } from '@/features/measurements/MeasurementFormView';

describe('FormErrorSummary', () => {
  it('renders nothing when there are no errors', async () => {
    const { toJSON } = await render(
      <FormErrorSummary errors={[undefined, undefined]} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('renders nothing when the errors are only empty strings', async () => {
    const { toJSON } = await render(
      <FormErrorSummary errors={['', undefined]} />,
    );
    expect(toJSON()).toBeNull();
  });

  it('exposes an assertive alert whose label lists every error', async () => {
    const { getByLabelText } = await render(
      <FormErrorSummary
        errors={['Enter a weight', undefined, 'Choose a date']}
      />,
    );
    const alert = getByLabelText(/Please check the following/);
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(alert.props.accessibilityLiveRegion).toBe('assertive');
    // The whole summary is read in one announcement via the container label, so a screen
    // reader user hears every problem after pressing submit.
    expect(alert.props.accessibilityLabel).toContain('Enter a weight');
    expect(alert.props.accessibilityLabel).toContain('Choose a date');
  });
});

describe('a Zod form exposes an error summary on invalid submit', () => {
  it('MeasurementFormView surfaces an accessible summary alert after a failed submit', async () => {
    const { findByLabelText, getByLabelText, queryByLabelText } = await render(
      <MeasurementFormView
        onSubmit={() => undefined}
        submitting={false}
        type="weight"
      />,
    );

    // No summary before the user tries to submit.
    expect(queryByLabelText(/Please check the following/)).toBeNull();

    // Submitting an empty form fails validation and must raise the summary.
    fireEvent.press(getByLabelText('Save'));

    const alert = await findByLabelText(/Please check the following/);
    expect(alert.props.accessibilityRole).toBe('alert');
    expect(typeof alert.props.accessibilityLabel).toBe('string');
    expect(alert.props.accessibilityLabel.length).toBeGreaterThan(0);
  });
});
