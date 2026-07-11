import { describe, expect, it } from '@jest/globals';

import {
  darkColours,
  lightColours,
  radii,
  shadows,
  spacing,
  tokens,
  touchTargets,
  typography,
} from '@/theme/tokens';

describe('design tokens', () => {
  it('exports every required semantic token group', () => {
    expect(tokens).toEqual({
      colours: { dark: darkColours, light: lightColours },
      radii,
      shadows,
      spacing,
      touchTargets,
      typography,
    });
  });

  it('keeps every interactive minimum at least 44 points', () => {
    expect(touchTargets.minimum).toBeGreaterThanOrEqual(44);
    expect(touchTargets.comfortable).toBeGreaterThanOrEqual(
      touchTargets.minimum,
    );
  });

  it('provides matching semantic colour keys in light and dark appearances', () => {
    expect(Object.keys(darkColours).sort()).toEqual(
      Object.keys(lightColours).sort(),
    );
  });
});
