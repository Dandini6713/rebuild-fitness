import { describe, expect, it } from '@jest/globals';

import {
  RULE_VERSION,
  summariseProteinWeek,
} from '@/domain/nutrition/proteinReport';

describe('summariseProteinWeek (docs/06 §6.8)', () => {
  it('computes the seven-day average over the whole window (unlogged days count as 0)', () => {
    const report = summariseProteinWeek([140, 140, 140, 140, 140, 140, 0], 140);
    // (140×6 + 0) / 7 = 120
    expect(report.averageProteinG).toBe(120);
    expect(report.daysConsidered).toBe(7);
    expect(report.ruleVersion).toBe(RULE_VERSION);
    expect(report.targetProteinG).toBe(140);
    expect(report.tolerancePercent).toBe(10);
  });

  it('counts days within ±10% of the target, at the boundary exactly', () => {
    // Target 140 → 10% = 14 → within-band is [126, 154] inclusive.
    const report = summariseProteinWeek(
      [126, 154, 125.99, 154.01, 140, 130, 150],
      140,
    );
    // Within: 126, 154, 140, 130, 150 = 5. Outside: 125.99, 154.01.
    expect(report.daysWithinTarget).toBe(5);
  });

  it('rounds the average to two decimals', () => {
    const report = summariseProteinWeek([100, 101, 101], 140);
    // 302 / 3 = 100.666… → 100.67
    expect(report.averageProteinG).toBe(100.67);
  });

  it('returns zeros for an empty window', () => {
    const report = summariseProteinWeek([], 140);
    expect(report.averageProteinG).toBe(0);
    expect(report.daysConsidered).toBe(0);
    expect(report.daysWithinTarget).toBe(0);
  });

  it('counts no within-target days at a non-positive target', () => {
    const report = summariseProteinWeek([0, 0, 0], 0);
    expect(report.daysWithinTarget).toBe(0);
  });
});
