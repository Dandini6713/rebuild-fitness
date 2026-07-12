// A tiny, private store for a readiness submission that could not reach Supabase
// (for example the phone was offline when the user finished the form). Following the
// local-first spirit of the workout player (docs/04 §4.4/§4.5), the answers are held
// on the device rather than lost, and re-submitted when the connection returns.
//
// Readiness answers are self-reported health context, which docs/07 treats as highly
// private, so the held submission lives in secure device storage, reusing the same
// chunked keychain-backed KeyValueStore as the onboarding draft.
//
// Scope: this holds a single pending submission (the most recent one). A full
// multi-item offline queue is a deliberately noted seam — one held check-in covers
// the realistic private-beta case of finishing a form with no signal.

import {
  createMemoryKeyValueStore,
  createSecureStore,
  type KeyValueStore,
} from './secureStore';

export type HeldReadinessSubmission = {
  checkinType: 'pre_session' | 'post_session' | 'next_morning';
  painScore: number;
  stiffnessChange: string;
  swellingLevel: string;
  walkingStatus: string;
  suddenChange: boolean;
  confidenceScore: number;
  scheduledSessionId: string | null;
  sessionEffort: number | null;
  notes: string | null;
  previousNextMorningIncrease: boolean;
  cannotBearWeight: boolean;
  // When the answers were captured, so a replayed submission can be ordered/aged.
  capturedAtIso: string;
};

const HELD_KEY = 'rebuild.readiness.held.v1';

export type HeldReadinessStore = {
  save(submission: HeldReadinessSubmission): Promise<void>;
  load(): Promise<HeldReadinessSubmission | null>;
  clear(): Promise<void>;
};

function fromKeyValueStore(store: KeyValueStore): HeldReadinessStore {
  return {
    async clear() {
      await store.removeItem(HELD_KEY);
    },
    async load() {
      const raw = await store.getItem(HELD_KEY);
      if (!raw) {
        return null;
      }
      try {
        return JSON.parse(raw) as HeldReadinessSubmission;
      } catch {
        // A corrupt value is not worth surfacing; drop it and start clean.
        await store.removeItem(HELD_KEY);
        return null;
      }
    },
    async save(submission) {
      await store.setItem(HELD_KEY, JSON.stringify(submission));
    },
  };
}

export function createHeldReadinessStore(): HeldReadinessStore {
  return fromKeyValueStore(createSecureStore());
}

// For tests and web: an in-memory store with no device dependency.
export function createMemoryHeldReadinessStore(): HeldReadinessStore {
  return fromKeyValueStore(createMemoryKeyValueStore());
}
