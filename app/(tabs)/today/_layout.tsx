import { Stack } from 'expo-router';

// The Today tab is a small stack so the strength workout player (roadmap 11,
// S-012) and the exercise guides it links to can be pushed on top of the Today
// screen. Headers stay hidden, matching the rest of the app where AppScreen owns
// the title; each pushed screen provides its own in-content Back control.
export default function TodayLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
