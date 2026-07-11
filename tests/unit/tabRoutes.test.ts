import { describe, expect, it } from '@jest/globals';

import { tabRoutes } from '@/features/navigation/tabRoutes';

describe('tabRoutes', () => {
  it('matches the documented five-item navigation order', () => {
    expect(tabRoutes.map(({ name }) => name)).toEqual([
      'today',
      'plan',
      'log',
      'progress',
      'more',
    ]);
  });

  it('provides a visible title and icon for every tab', () => {
    expect(
      tabRoutes.every(({ icon, title }) => icon.length > 0 && title.length > 0),
    ).toBe(true);
  });
});
