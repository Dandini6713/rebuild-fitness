// Pure time arithmetic for the strength workout player (S-012): the elapsed
// workout clock in the header and the between-sets rest timer. Everything here is
// a small, testable function with no React, no I/O and no reliance on the ambient
// clock — the caller passes `nowMs`, so a test can drive any instant. Mirrors the
// other domain/training helpers.
//
// Times are handled in milliseconds/seconds; nothing here diagnoses or assesses
// anything (docs/07). The rest timer is a convenience, never a safety gate.

// Whole seconds elapsed since `startIso`, never negative (a clock that appears to
// run backwards, or a start stamped slightly in the future, reads as 0 rather
// than a jarring negative time). `startIso` is the workout_log.started_at stamp.
export function elapsedSeconds(startIso: string, nowMs: number): number {
  const startMs = Date.parse(startIso);
  if (Number.isNaN(startMs)) {
    return 0;
  }
  return Math.max(0, Math.floor((nowMs - startMs) / 1000));
}

// A compact clock: "M:SS" under an hour, "H:MM:SS" once an hour has passed. Used
// for the visible elapsed time and rest countdown.
export function formatDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const two = (value: number) => `${value}`.padStart(2, '0');
  if (hours > 0) {
    return `${hours}:${two(minutes)}:${two(seconds)}`;
  }
  return `${minutes}:${two(seconds)}`;
}

// A spoken-length description for accessibility labels, so a screen reader hears
// "3 minutes, 5 seconds" rather than the terse "3:05". British English.
export function describeDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  const parts: string[] = [];
  if (minutes > 0) {
    parts.push(`${minutes} ${minutes === 1 ? 'minute' : 'minutes'}`);
  }
  parts.push(`${seconds} ${seconds === 1 ? 'second' : 'seconds'}`);
  return parts.join(', ');
}

// Whole seconds left on a rest timer that began at `restStartedAtMs` and runs for
// `durationSeconds`, clamped to zero once it has run out. Rounded up so the last
// visible second is a full "1" rather than flickering to zero early.
export function restRemainingSeconds(
  restStartedAtMs: number,
  durationSeconds: number,
  nowMs: number,
): number {
  const endMs = restStartedAtMs + Math.max(0, durationSeconds) * 1000;
  return Math.max(0, Math.ceil((endMs - nowMs) / 1000));
}

// Whether a rest timer that began at `restStartedAtMs` for `durationSeconds` has
// finished by `nowMs`. Kept separate from the remaining count so the UI can react
// to completion (hide the timer, give a cue) without re-deriving the arithmetic.
export function isRestFinished(
  restStartedAtMs: number,
  durationSeconds: number,
  nowMs: number,
): boolean {
  return restRemainingSeconds(restStartedAtMs, durationSeconds, nowMs) === 0;
}
