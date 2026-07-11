import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ headerShown: true, title: 'Not found' }} />
      <View style={styles.container}>
        <Text style={styles.title}>This screen does not exist.</Text>
        <Link accessibilityRole="link" href="/(tabs)/today" style={styles.link}>
          Return to Today
        </Link>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: {
    color: '#182323',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  link: { color: '#155e63', fontSize: 17, minHeight: 44, paddingVertical: 10 },
});
