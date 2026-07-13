import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import {
  ReadinessResultView,
  type SubstitutionOffer,
} from '@/features/readiness/ReadinessResultView';
import type { ReadinessClassification } from '@/domain/training/readinessClassification';
import type { ReadinessResultState } from '@/features/readiness/useReadiness';

function classified(
  classification: ReadinessClassification,
): ReadinessResultState {
  return {
    result: {
      classification,
      id: 'chk-1',
      reasons: [{ code: 'moderate-pain', message: 'Moderate pain today.' }],
      ruleVersion: 'readiness/v1',
    },
    scheduleNextMorning: false,
    status: 'classified',
  };
}

const offer = (
  overrides: Partial<SubstitutionOffer> = {},
): SubstitutionOffer => ({
  onReset: overrides.onReset ?? (() => {}),
  onSelect: overrides.onSelect ?? (() => {}),
  state: overrides.state ?? { status: 'idle' },
});

describe('ReadinessResultView — amber activity substitution', () => {
  it('offers the swap on an amber result when a session is present', async () => {
    const view = await render(
      <ReadinessResultView
        onDone={() => {}}
        onReset={() => {}}
        state={classified('amber')}
        substitution={offer()}
      />,
    );
    expect(view.getByLabelText(/Swap to Flat walking/i)).toBeOnTheScreen();
    // A user can also decline the swap and still handle it themselves.
    expect(view.getByText('Not now')).toBeOnTheScreen();
  });

  it('does not offer the swap on a green result', async () => {
    const view = await render(
      <ReadinessResultView
        onDone={() => {}}
        onReset={() => {}}
        state={classified('green')}
        substitution={offer()}
      />,
    );
    expect(view.queryByLabelText(/Swap to Flat walking/i)).toBeNull();
  });

  it('does not offer the swap on a red result', async () => {
    const view = await render(
      <ReadinessResultView
        onDone={() => {}}
        onReset={() => {}}
        state={classified('red')}
        substitution={offer()}
      />,
    );
    expect(view.queryByLabelText(/Swap to Flat walking/i)).toBeNull();
  });

  it('routes a chosen option through the offer', async () => {
    const onSelect = jest.fn();
    const view = await render(
      <ReadinessResultView
        onDone={() => {}}
        onReset={() => {}}
        state={classified('amber')}
        substitution={offer({ onSelect: onSelect as () => void })}
      />,
    );
    fireEvent.press(view.getByLabelText(/Swap to Rest day/i));
    expect(onSelect).toHaveBeenCalledWith('rest');
  });

  it('falls back to a plain amber acknowledgement with no substitution offer', async () => {
    const view = await render(
      <ReadinessResultView
        onDone={() => {}}
        onReset={() => {}}
        state={classified('amber')}
      />,
    );
    expect(view.queryByLabelText(/Swap to Flat walking/i)).toBeNull();
    expect(view.getByText('Done')).toBeOnTheScreen();
  });
});
