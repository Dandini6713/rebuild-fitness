// Local persistence for the resumable onboarding draft. Thin wrapper over the
// secure key–value store; the draft parsing/serialisation lives in
// onboardingDraft.ts so this stays trivial and injectable for tests.

import {
  createSecureStore,
  type KeyValueStore,
} from '@/lib/persistence/secureStore';

import {
  type OnboardingDraft,
  parseDraft,
  serialiseDraft,
} from './onboardingDraft';

const DRAFT_KEY = 'rebuild.onboarding.draft.v1';

export type OnboardingStore = {
  clear(): Promise<void>;
  load(): Promise<OnboardingDraft>;
  save(draft: OnboardingDraft): Promise<void>;
};

export function createOnboardingStore(store: KeyValueStore): OnboardingStore {
  return {
    async clear() {
      await store.removeItem(DRAFT_KEY);
    },
    async load() {
      return parseDraft(await store.getItem(DRAFT_KEY));
    },
    async save(draft) {
      await store.setItem(DRAFT_KEY, serialiseDraft(draft));
    },
  };
}

export const onboardingStore = createOnboardingStore(createSecureStore());
