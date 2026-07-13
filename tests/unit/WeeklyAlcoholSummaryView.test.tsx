import { describe, expect, it } from '@jest/globals';
import { render } from '@testing-library/react-native';

import type { WeeklyReadModel } from '@/features/alcohol/alcoholRepository';
import { WeeklyAlcoholSummaryView } from '@/features/alcohol/WeeklyAlcoholSummaryView';

function model(overrides: Partial<WeeklyReadModel> = {}): WeeklyReadModel {
  return {
    recent: [
      {
        abvPercent: 5,
        calories: 200,
        drinkName: 'Lager',
        drinkType: 'Beer',
        id: 'a',
        loggedAtIso: '2026-07-13T18:00:00.000Z',
        occasionNote: null,
        units: 2.84,
        volumeMl: 568,
      },
    ],
    summary: {
      alcoholFreeDays: 5,
      daysInWindow: 7,
      percentOfLimit: 46,
      totalCalories: 520,
      totalDrinks: 3,
      totalUnits: 6.49,
      weeklyLimitUnits: 14,
    },
    ...overrides,
  };
}

// Collect only the VISIBLE text leaves of the rendered tree (the string children), so the
// tone assertion scans copy the user actually reads — not style keys like `shadowOffset`,
// which would false-positive on a substring such as "offset".
function renderedText(node: unknown): string {
  if (typeof node === 'string') {
    return node;
  }
  if (Array.isArray(node)) {
    return node.map(renderedText).join(' ');
  }
  if (node && typeof node === 'object') {
    const record = node as {
      children?: unknown;
      props?: { accessibilityLabel?: unknown };
    };
    const label =
      typeof record.props?.accessibilityLabel === 'string'
        ? record.props.accessibilityLabel
        : '';
    return `${label} ${renderedText(record.children)}`;
  }
  return '';
}

// The tone rule is a HARD requirement (docs/07 §7.4, the roadmap-20 brief). None of this
// vocabulary may appear anywhere in the summary — no moralising, no praise for abstaining,
// and NO compensatory suggestion (fasting, meal-skipping, dehydration, "earn it back"
// exercise). Kept deliberately broad; a match is a bug.
const FORBIDDEN = [
  'too much',
  'cut down',
  'cut back',
  'well done',
  'congrat',
  'earn',
  'offset',
  'burn',
  'skip',
  'fasting',
  'dehydrat',
  'guilt',
  'shame',
  'exceed',
  'over your limit',
  'over the limit',
  'binge',
  'should not',
  'compensat',
];

describe('WeeklyAlcoholSummaryView', () => {
  it('shows the loading state', async () => {
    const { getByText } = await render(
      <WeeklyAlcoholSummaryView state={{ status: 'loading' }} />,
    );
    expect(getByText('Loading your weekly summary…')).toBeTruthy();
  });

  it('shows the five metrics including percentage of limit when set', async () => {
    const { getByText } = await render(
      <WeeklyAlcoholSummaryView state={{ data: model(), status: 'ready' }} />,
    );
    expect(getByText('Drinks')).toBeTruthy();
    expect(getByText('Units')).toBeTruthy();
    expect(getByText('Estimated calories')).toBeTruthy();
    expect(getByText('Alcohol-free days')).toBeTruthy();
    expect(getByText('5 of 7')).toBeTruthy();
    expect(getByText('Of your weekly limit')).toBeTruthy();
    expect(getByText('46% of 14 units')).toBeTruthy();
  });

  it('omits the percentage line and invites setting a limit when none is set', async () => {
    const { queryByText, getByText } = await render(
      <WeeklyAlcoholSummaryView
        state={{
          data: model({
            summary: {
              alcoholFreeDays: 7,
              daysInWindow: 7,
              percentOfLimit: null,
              totalCalories: 0,
              totalDrinks: 0,
              totalUnits: 0,
              weeklyLimitUnits: null,
            },
            recent: [],
          }),
          status: 'ready',
        }}
      />,
    );
    expect(queryByText('Of your weekly limit')).toBeNull();
    expect(getByText(/Set a personal weekly limit/)).toBeTruthy();
  });

  it('shows a neutral empty state when no drinks are recorded', async () => {
    const { getByText } = await render(
      <WeeklyAlcoholSummaryView
        state={{
          data: model({
            recent: [],
            summary: {
              alcoholFreeDays: 7,
              daysInWindow: 7,
              percentOfLimit: null,
              totalCalories: 0,
              totalDrinks: 0,
              totalUnits: 0,
              weeklyLimitUnits: null,
            },
          }),
          status: 'ready',
        }}
      />,
    );
    // Factual, not congratulatory.
    expect(getByText('No drinks recorded')).toBeTruthy();
  });

  it('carries no moralising or compensatory copy in any state', async () => {
    for (const state of [
      { data: model(), status: 'ready' as const },
      {
        data: model({
          recent: [],
          summary: {
            alcoholFreeDays: 7,
            daysInWindow: 7,
            percentOfLimit: null,
            totalCalories: 0,
            totalDrinks: 0,
            totalUnits: 0,
            weeklyLimitUnits: null,
          },
        }),
        status: 'ready' as const,
      },
    ]) {
      const { toJSON } = await render(
        <WeeklyAlcoholSummaryView state={state} />,
      );
      const text = renderedText(toJSON()).toLowerCase();
      for (const term of FORBIDDEN) {
        expect(text).not.toContain(term);
      }
    }
  });
});
