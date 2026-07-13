import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { NutritionTargetView } from '@/features/nutrition/NutritionTargetView';
import type { ValidatedTarget } from '@/features/nutrition/nutritionSchema';
import type { NutritionTargetsState } from '@/features/nutrition/useNutritionTargets';

const READY: NutritionTargetsState = {
  data: {
    current: { calories: 2100, effectiveFrom: '2026-07-01', proteinG: 145 },
    history: [
      {
        calories: 2100,
        effectiveFrom: '2026-07-01',
        id: 't2',
        proteinG: 145,
        source: 'user',
      },
      {
        calories: 2200,
        effectiveFrom: '2026-06-01',
        id: 't1',
        proteinG: 140,
        source: 'user',
      },
    ],
  },
  status: 'ready',
};

describe('NutritionTargetView', () => {
  it('shows the current target and its history', async () => {
    const { getByText } = await render(
      <NutritionTargetView
        onSetTarget={() => {}}
        setState={{ status: 'idle' }}
        state={READY}
      />,
    );
    expect(getByText('2,100 kcal and 145 g protein a day.')).toBeTruthy();
    expect(getByText('Target history')).toBeTruthy();
    expect(getByText('From 1 Jun 2026')).toBeTruthy();
  });

  it('validates the form and does not submit an empty calorie target', async () => {
    const onSetTarget = jest.fn();
    const { getByText } = await render(
      <NutritionTargetView
        onSetTarget={onSetTarget}
        setState={{ status: 'idle' }}
        state={READY}
      />,
    );
    await fireEvent.press(getByText('Save target'));
    expect(onSetTarget).not.toHaveBeenCalled();
  });

  it('submits a valid new target', async () => {
    const onSetTarget = jest.fn<(target: ValidatedTarget) => void>();
    const { getByPlaceholderText, getByText } = await render(
      <NutritionTargetView
        now={new Date('2026-07-13T12:00:00.000Z')}
        onSetTarget={onSetTarget}
        setState={{ status: 'idle' }}
        state={READY}
      />,
    );
    await fireEvent.changeText(getByPlaceholderText('e.g. 2100'), '2000');
    // Protein defaults to 140; leave it.
    await fireEvent.press(getByText('Save target'));
    expect(onSetTarget).toHaveBeenCalledTimes(1);
    const arg = onSetTarget.mock.calls[0]![0];
    expect(arg.calories).toBe(2000);
    expect(arg.proteinG).toBe(140);
  });

  it('shows a saved confirmation', async () => {
    const { getByText } = await render(
      <NutritionTargetView
        onSetTarget={() => {}}
        setState={{ status: 'saved' }}
        state={READY}
      />,
    );
    expect(getByText(/Target saved/)).toBeTruthy();
  });
});
