// The native audio + haptic implementation of CardioCueAdapter (S-014: "Audio and
// haptic cues must work with the screen locked where platform rules permit").
//
// ⚠️ REQUIRES A SIMULATOR / DEVICE PASS. This is the only part of the cardio player
// that jest cannot verify: audio and haptic firing is device-runtime behaviour, and
// nothing in this repo has run in a simulator yet. It is loaded lazily on native
// ONLY (see createCardioCueAdapter.ts) so it is never imported into a test or web
// bundle; tests inject a recording adapter and assert cue ROUTING, not sound.
// Signing this off means: run a real cardio session on a device and confirm each
// cue actually fires (run-start beep, walk change, 3-2-1 countdown ticks, the
// completion chime) with the screen locked.
//
// It maps the pure CueEvent kinds to effects:
//   segment-start → run: rising beep + heavy impact; walk/other: change tone + light
//   halfway       → selection haptic (a quiet mid-segment nudge, no sound)
//   countdown     → countdown tick + light impact (the final 3-2-1)
//   segment-end   → (silent; the next segment-start carries the audible transition)
//   session-complete → completion chime + success notification
//
// Every call is wrapped so a runtime failure (audio focus lost, asset missing) is
// swallowed — a missed cue must never interrupt the session. This module keeps the
// audio players alive for the life of the session; release() disposes them.

import type { AudioPlayer } from 'expo-audio';
import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

import type { CueEvent } from '@/domain/training/cardioIntervalPlayer';

import type { CardioCueAdapter } from './cardioCueAdapter';

const KEEP_AWAKE_TAG = 'cardio-player';

// Load the bundled cue tones once. Requires resolve at bundle time on a device;
// they are never evaluated in jest because this module is only required on native.
const SOUND_SOURCES = {
  change: require('../../assets/audio/cue-change.wav'),
  complete: require('../../assets/audio/cue-complete.wav'),
  countdown: require('../../assets/audio/cue-countdown.wav'),
  start: require('../../assets/audio/cue-start.wav'),
} as const;

type SoundKey = keyof typeof SOUND_SOURCES;

function safe(action: () => void): void {
  try {
    action();
  } catch {
    // Best-effort: a missed cue must never interrupt the session.
  }
}

export function createDeviceCardioCueAdapter(): CardioCueAdapter {
  const players: Partial<Record<SoundKey, AudioPlayer>> = {};

  function play(key: SoundKey): void {
    safe(() => {
      const player = players[key];
      if (!player) {
        return;
      }
      player.seekTo(0);
      player.play();
    });
  }

  return {
    cue(event: CueEvent) {
      switch (event.kind) {
        case 'segment-start':
          if (event.activityType === 'run') {
            play('start');
            safe(
              () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy),
            );
          } else {
            play('change');
            safe(
              () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
            );
          }
          break;
        case 'halfway':
          safe(() => void Haptics.selectionAsync());
          break;
        case 'countdown':
          play('countdown');
          safe(
            () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light),
          );
          break;
        case 'segment-end':
          // Silent: the following segment-start carries the audible transition.
          break;
        case 'session-complete':
          play('complete');
          safe(
            () =>
              void Haptics.notificationAsync(
                Haptics.NotificationFeedbackType.Success,
              ),
          );
          break;
      }
    },

    prepare() {
      // Keep the screen awake through the session and set an audio mode that lets
      // cues play alongside other audio and while the screen is locked. Both are
      // best-effort; a denied audio mode simply means quieter cues, not a failure.
      safe(() => void activateKeepAwakeAsync(KEEP_AWAKE_TAG));
      safe(
        () =>
          void setAudioModeAsync({
            playsInSilentMode: true,
            shouldPlayInBackground: true,
          }),
      );
      for (const key of Object.keys(SOUND_SOURCES) as SoundKey[]) {
        safe(() => {
          players[key] = createAudioPlayer(SOUND_SOURCES[key]);
        });
      }
    },

    release() {
      safe(() => deactivateKeepAwake(KEEP_AWAKE_TAG));
      for (const key of Object.keys(players) as SoundKey[]) {
        safe(() => players[key]?.remove());
        delete players[key];
      }
    },
  };
}
