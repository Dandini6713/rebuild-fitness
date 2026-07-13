import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import { FoodDiaryView } from '@/features/nutrition/FoodDiaryView';
import type { DiaryReadModel } from '@/features/nutrition/nutritionRepository';

function model(overrides: Partial<DiaryReadModel> = {}): DiaryReadModel {
  return {
    caloriesProgress: {
      consumed: 1100,
      percent: 52,
      remaining: 1000,
      target: 2100,
    },
    proteinProgress: { consumed: 65, percent: 45, remaining: 80, target: 145 },
    summary: {
      meals: [
        {
          calories: 400,
          entries: [
            {
              calories: 400,
              description: 'Porridge',
              id: 'l1',
              mealType: 'breakfast',
              proteinG: 20,
            },
          ],
          mealType: 'breakfast',
          proteinG: 20,
        },
        {
          calories: 700,
          entries: [
            {
              calories: 700,
              description: 'Chicken salad',
              id: 'l2',
              mealType: 'lunch',
              proteinG: 45,
            },
          ],
          mealType: 'lunch',
          proteinG: 45,
        },
      ],
      totals: { calories: 1100, proteinG: 65 },
    },
    target: { calories: 2100, effectiveFrom: '2026-07-01', proteinG: 145 },
    ...overrides,
  };
}

describe('FoodDiaryView', () => {
  it('shows the loading state', async () => {
    const { getByText } = await render(
      <FoodDiaryView state={{ status: 'loading' }} />,
    );
    expect(getByText('Loading your diary…')).toBeTruthy();
  });

  it('shows the error state', async () => {
    const { getByText } = await render(
      <FoodDiaryView state={{ message: 'boom', status: 'error' }} />,
    );
    expect(getByText('boom')).toBeTruthy();
  });

  it('shows an empty state when nothing is logged, but still shows totals of zero', async () => {
    const { getByText } = await render(
      <FoodDiaryView
        state={{
          data: model({
            caloriesProgress: {
              consumed: 0,
              percent: 0,
              remaining: 2100,
              target: 2100,
            },
            proteinProgress: {
              consumed: 0,
              percent: 0,
              remaining: 145,
              target: 145,
            },
            summary: { meals: [], totals: { calories: 0, proteinG: 0 } },
          }),
          status: 'ready',
        }}
      />,
    );
    expect(getByText('Your diary is empty today')).toBeTruthy();
    expect(getByText("Today's totals")).toBeTruthy();
  });

  it('groups entries by meal with totals and remaining against the target', async () => {
    const { getByText } = await render(
      <FoodDiaryView state={{ data: model(), status: 'ready' }} />,
    );
    expect(getByText('Breakfast')).toBeTruthy();
    expect(getByText('Lunch')).toBeTruthy();
    expect(getByText('Porridge')).toBeTruthy();
    expect(getByText('Chicken salad')).toBeTruthy();
    expect(getByText(/1,000 kcal remaining/)).toBeTruthy();
  });

  it('shows a no-target notice when there is no target', async () => {
    const { getByText } = await render(
      <FoodDiaryView
        state={{
          data: model({
            caloriesProgress: null,
            proteinProgress: null,
            target: null,
          }),
          status: 'ready',
        }}
      />,
    );
    expect(getByText(/No target set — showing totals only/)).toBeTruthy();
  });
});
