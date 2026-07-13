// The narrow boundary between the pure cue DECISION (domain/training/
// cardioIntervalPlayer.ts) and the device cue EFFECT (audio + haptics). The pure
// scheduler emits typed CueEvents; this adapter turns them into actual sound and
// vibration. It is the ONE part of the cardio player jest cannot verify — audio and
// haptic firing is device-runtime behaviour — so it is isolated here, mocked in
// tests, and its real implementation (deviceCardioCueAdapter.ts) is marked as
// requiring a simulator/device pass. A failure here means "a cue did not fire",
// never "the timer logic is wrong".
//
// The hook holds one adapter for the life of a session: prepare() once at the
// start (acquire audio focus / keep the screen awake), cue() per event, and
// release() at the end (tear those down). Every method is best-effort and must
// never throw into the player — a missed cue must not interrupt a workout.

import type { CueEvent } from '@/domain/training/cardioIntervalPlayer';

export type CardioCueAdapter = {
  // Acquire whatever the session needs to cue reliably (audio mode, keep-awake).
  // Called once when the player becomes ready.
  prepare(): void;
  // Fire the effect for one cue event.
  cue(event: CueEvent): void;
  // Release everything acquired in prepare(). Called once when the player closes.
  release(): void;
};

// A do-nothing adapter: the default on web and in tests, where there is no audio or
// haptic hardware to drive. Also the safe fallback if the device adapter cannot
// load. Nothing here observes the events; a test that wants to assert cue routing
// injects its own recording adapter instead.
export function createNoopCardioCueAdapter(): CardioCueAdapter {
  return {
    cue() {
      /* no-op */
    },
    prepare() {
      /* no-op */
    },
    release() {
      /* no-op */
    },
  };
}
