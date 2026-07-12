import { Stack } from 'expo-router';

// The More tab is a small stack so the exercise catalogue and its S-013 guides
// (roadmap 10) can be pushed on top of the settings screen. Headers stay hidden,
// matching the rest of the app where AppScreen owns the title; each pushed screen
// provides its own in-content Back control.
export default function MoreLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
