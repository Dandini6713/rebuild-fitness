import { Tabs } from 'expo-router';
import { Text } from 'react-native';

import { tabRoutes } from '@/features/navigation/tabRoutes';

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#155e63',
        tabBarInactiveTintColor: '#5f6b6b',
        tabBarStyle: { minHeight: 64, paddingBottom: 8, paddingTop: 6 },
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
