import { describe, expect, it } from '@jest/globals';

import {
  buildSubstitutionReason,
  findSubstitutionOption,
  resolveSubstitution,
  SUBSTITUTION_OPTIONS,
  type SubstitutionActivity,
} from '@/domain/training/activitySubstitution';

describe('activity substitution options (docs/06 §6.2)', () => {
  it('offers exactly flat walking, easy cycling, the cross-trainer and rest, in order', () => {
    expect(SUBSTITUTION_OPTIONS.map((option) => option.activity)).toEqual([
      'walk',
      'bike',
      'cross_trainer',
      'rest',
    ]);
  });

  it('types every low-impact cardio choice as cardio and rest as rest (the roadmap 16 seam)', () => {
    // Walk, bike and cross-trainer all fold into the single 'cardio' type today; only
    // rest is 'rest'. Distinct cardio activity types arrive with the cardio player.
    expect(findSubstitutionOption('walk').newType).toBe('cardio');
    expect(findSubstitutionOption('bike').newType).toBe('cardio');
    expect(findSubstitutionOption('cross_trainer').newType).toBe('cardio');
    expect(findSubstitutionOption('rest').newType).toBe('rest');
  });

  it('resolves an activity to its session type and a reason naming the specific choice', () => {
    // The specific activity survives in the reason even though a walk stores as cardio.
    expect(resolveSubstitution('bike')).toEqual({
      newType: 'cardio',
      reason:
        'Amber readiness result — replaced with easy cycling. The running week does not progress.',
    });
    expect(resolveSubstitution('rest')).toEqual({
      newType: 'rest',
      reason:
        'Amber readiness result — replaced with a rest day. The running week does not progress.',
    });
  });

  it('names each activity distinctly in the recorded reason', () => {
    const reasons = SUBSTITUTION_OPTIONS.map((option) =>
      buildSubstitutionReason(option.activity),
    );
    expect(new Set(reasons).size).toBe(SUBSTITUTION_OPTIONS.length);
    for (const reason of reasons) {
      // Never implies progression (docs/06 §6.2 "do not progress the running week").
      expect(reason).toContain('does not progress');
      // Comfortably within the 500-character reschedule_reason column limit.
      expect(reason.length).toBeLessThan(500);
    }
  });

  it('rejects an unknown activity rather than guessing', () => {
    expect(() =>
      findSubstitutionOption('swim' as SubstitutionActivity),
    ).toThrow(/Unknown substitution activity/);
  });
});
