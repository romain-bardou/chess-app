import { Tabs } from 'expo-router/js-tabs';

import { t } from '@/lib/i18n';
import { Colors, Typography } from '@/theme/atelier';

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: Colors.accent,
        tabBarInactiveTintColor: Colors.textMuted,
        tabBarStyle: {
          backgroundColor: Colors.surface,
          borderTopColor: Colors.border,
        },
        tabBarLabelStyle: Typography.label,
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabs.review'), tabBarIcon: () => null }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: t('tabs.stats'), tabBarIcon: () => null }}
      />
    </Tabs>
  );
}
