import { PropsWithChildren } from 'react';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

type ScreenPlaceholderProps = PropsWithChildren<{
  description: string;
  eyebrow?: string;
  title: string;
}>;

export function ScreenPlaceholder({
  children,
  description,
  eyebrow,
  title,
}: ScreenPlaceholderProps) {
  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
        <Text accessibilityRole="header" style={styles.title}>
          {title}
        </Text>
        <Text style={styles.description}>{description}</Text>
        {children}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { backgroundColor: '#f7f4ee', flex: 1 },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
  eyebrow: {
    color: '#155e63',
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.8,
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  title: {
    color: '#182323',
    fontSize: 36,
    fontWeight: '700',
    marginBottom: 12,
  },
  description: {
    color: '#4c5959',
    fontSize: 18,
    lineHeight: 27,
    maxWidth: 420,
  },
});
