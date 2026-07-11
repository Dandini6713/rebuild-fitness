import { describe, expect, it } from '@jest/globals';

import {
  EMPTY_DRAFT,
  type OnboardingDraft,
} from '@/features/onboarding/onboardingDraft';
import { createOnboardingStore } from '@/features/onboarding/onboardingStorage';
import { createMemoryKeyValueStore } from '@/lib/persistence/secureStore';

const draft: OnboardingDraft = {
  currentStepId: 'availability',
  goals: {
    currentWeightKg: 90,
    heightCm: 183,
    mainObjective: 'lose_fat',
    preferredRate: 'steady',
    targetWeightKg: 84,
    waistCm: 96,
  },
  version: 1,
};

describe('onboarding local store', () => {
  it('saves and reloads a draft so onboarding can resume', async () => {
    const store = createOnboardingStore(createMemoryKeyValueStore());
    await store.save(draft);
    await expect(store.load()).resolves.toEqual(draft);
  });

  it('clears the draft and returns an empty draft afterwards', async () => {
    const store = createOnboardingStore(createMemoryKeyValueStore());
    await store.save(draft);
    await store.clear();
    await expect(store.load()).resolves.toEqual(EMPTY_DRAFT);
  });
});
