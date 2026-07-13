import { Stack } from 'expo-router';

// The Progress tab is a small stack so the weekly review (roadmap 23, S-041) can be pushed
// on top of the dashboard. Headers stay hidden, matching the rest of the app where
// AppScreen owns the title; each pushed screen provides its own in-content Back control.
export default function ProgressLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
