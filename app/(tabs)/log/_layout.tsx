import { Stack } from 'expo-router';

// The Log tab is a small stack so the measurement entry forms and the measurement
// history (roadmap 18, S-034) can be pushed on top of the log hub. Headers stay hidden,
// matching the rest of the app where AppScreen owns the title; each pushed screen
// provides its own in-content Back control.
export default function LogLayout() {
  return <Stack screenOptions={{ headerShown: false }} />;
}
