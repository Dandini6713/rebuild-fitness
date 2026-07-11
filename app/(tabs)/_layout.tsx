import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { tabRoutes } from '@/features/navigation/tabRoutes';
import { useAppTheme } from '@/theme/useAppTheme';

export default function TabLayout() {
  const { colours } = useAppTheme();

  return (
    <Tabs
      screenOptions={{
        sceneStyle: { backgroundColor: colours.background },
        headerShown: false,
        tabBarActiveTintColor: colours.accent,
        tabBarInactiveTintColor: colours.textTertiary,
        tabBarStyle: {
          backgroundColor: colours.surface,
          borderTopColor: colours.borderSubtle,
          minHeight: 64,
          paddingBottom: 8,
          paddingTop: 6,
        },
      }}
    >
      {tabRoutes.map((tab) => (
        <Tabs.Screen
          key={tab.name}
          name={tab.name}
          options={{
            title: tab.title,
            tabBarAccessibilityLabel: `${tab.title} tab`,
            tabBarIcon: ({ color }) => (
              <Text accessibilityElementsHidden style={{ color, fontSize: 18 }}>
                {tab.icon}
              </Text>
            ),
          }}
        />
      ))}
    </Tabs>
  );
}
