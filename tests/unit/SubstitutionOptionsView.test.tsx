import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import type { SubstitutionActivity } from '@/domain/training/activitySubstitution';
import { SubstitutionOptionsView } from '@/features/readiness/SubstitutionOptionsView';
import type { SessionSubstitutionState } from '@/features/readiness/useSessionSubstitution';

const noop = () => {};

function renderView(
  state: SessionSubstitutionState,
  overrides: Partial<{
    onSelect: (activity: SubstitutionActivity) => void;
    onReset: () => void;
    onDone: () => void;
  }> = {},
) {
  return render(
    <SubstitutionOptionsView
      onDone={overrides.onDone ?? noop}
      onReset={overrides.onReset ?? noop}
      onSelect={overrides.onSelect ?? noop}
      state={state}
    />,
  );
}

describe('SubstitutionOptionsView — the amber offer', () => {
  it('offers the four gentler options with the docs/06 §6.2 framing', async () => {
    const view = await renderView({ status: 'idle' });
    expect(view.getByText(/sensible choice today/i)).toBeOnTheScreen();
    expect(view.getByText(/running week does not progress/i)).toBeOnTheScreen();
    expect(view.getByLabelText(/Swap to Flat walking/i)).toBeOnTheScreen();
    expect(view.getByLabelText(/Swap to Easy cycling/i)).toBeOnTheScreen();
    expect(view.getByLabelText(/Swap to Cross-trainer/i)).toBeOnTheScreen();
    expect(view.getByLabelText(/Swap to Rest day/i)).toBeOnTheScreen();
  });

  it('calls onSelect with the chosen activity', async () => {
    const onSelect = jest.fn<(activity: SubstitutionActivity) => void>();
    const view = await renderView({ status: 'idle' }, { onSelect });
    fireEvent.press(view.getByLabelText(/Swap to Easy cycling/i));
    expect(onSelect).toHaveBeenCalledWith('bike');
  });

  it('shows a success acknowledgement once the session is swapped', async () => {
    const onDone = jest.fn();
    const view = await renderView(
      { newSessionId: 'new-1', status: 'substituted' },
      { onDone },
    );
    expect(view.getByText(/swapped today/i)).toBeOnTheScreen();
    fireEvent.press(view.getByText('Done'));
    expect(onDone).toHaveBeenCalledTimes(1);
  });

  it('fails honestly when offline, offering a retry', async () => {
    const onReset = jest.fn();
    const view = await renderView({ status: 'offline' }, { onReset });
    expect(view.getByText(/back online/i)).toBeOnTheScreen();
    fireEvent.press(view.getByText('Try again'));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('shows a server error with a retry', async () => {
    const view = await renderView({
      message: 'only a planned session can be substituted',
      status: 'error',
    });
    expect(view.getByText(/planned session/i)).toBeOnTheScreen();
    expect(view.getByText('Try again')).toBeOnTheScreen();
  });
});
