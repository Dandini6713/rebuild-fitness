import { describe, expect, it, jest } from '@jest/globals';
import { fireEvent, render } from '@testing-library/react-native';

import { FoodEntryView } from '@/features/nutrition/FoodEntryView';
import type { FoodLibraryState } from '@/features/nutrition/useFoodLibrary';

const LIBRARY: FoodLibraryState = {
  data: {
    all: [
      {
        calories: 180,
        carbohydrateG: 30,
        fatG: 3,
        favourite: false,
        id: 'f1',
        name: 'Porridge',
        proteinG: 6,
        servingDescription: '1 bowl',
      },
    ],
    favourites: [],
    recent: [],
  },
  status: 'ready',
};

const noop = () => {};

function renderView(
  overrides: Partial<React.ComponentProps<typeof FoodEntryView>> = {},
) {
  return render(
    <FoodEntryView
      foods={LIBRARY}
      now={new Date('2026-07-13T12:00:00.000Z')}
      onCreateFood={overrides.onCreateFood ?? noop}
      onLogFood={overrides.onLogFood ?? noop}
      onLogQuickEntry={overrides.onLogQuickEntry ?? noop}
      onOpenSavedMeals={overrides.onOpenSavedMeals ?? noop}
      submitting={overrides.submitting ?? false}
    />,
  );
}

describe('FoodEntryView', () => {
  it('logs a valid quick entry with the selected meal', async () => {
    const onLogQuickEntry = jest.fn();
    const view = await renderView({ onLogQuickEntry });
    await fireEvent.changeText(view.getByLabelText('Entry name'), 'Flat white');
    await fireEvent.changeText(view.getByLabelText('Calories in kcal'), '250');
    await fireEvent.changeText(view.getByLabelText('Protein in grams'), '8');
    await fireEvent.press(view.getByText('Add quick entry'));
    expect(onLogQuickEntry).toHaveBeenCalledTimes(1);
    const entry = onLogQuickEntry.mock.calls[0]![0] as {
      mealType: string;
      calories: number;
    };
    expect(entry.mealType).toBe('breakfast');
    expect(entry.calories).toBe(250);
  });

  it('does not log an incomplete quick entry', async () => {
    const onLogQuickEntry = jest.fn();
    const view = await renderView({ onLogQuickEntry });
    await fireEvent.press(view.getByText('Add quick entry'));
    expect(onLogQuickEntry).not.toHaveBeenCalled();
  });

  it('logs a saved food with a serving quantity', async () => {
    const onLogFood = jest.fn();
    const view = await renderView({ onLogFood });
    await fireEvent.press(view.getByLabelText('Log Porridge'));
    expect(onLogFood).toHaveBeenCalledTimes(1);
    const arg = onLogFood.mock.calls[0]![0] as {
      food: { id: string };
      servingQuantity: number;
      mealType: string;
    };
    expect(arg.food.id).toBe('f1');
    expect(arg.servingQuantity).toBe(1);
    expect(arg.mealType).toBe('breakfast');
  });

  it('routes to creating a food and to saved meals', async () => {
    const onCreateFood = jest.fn();
    const onOpenSavedMeals = jest.fn();
    const view = await renderView({ onCreateFood, onOpenSavedMeals });
    await fireEvent.press(view.getByText('Create a new food'));
    await fireEvent.press(view.getByText('Log a saved meal'));
    expect(onCreateFood).toHaveBeenCalledTimes(1);
    expect(onOpenSavedMeals).toHaveBeenCalledTimes(1);
  });
});
