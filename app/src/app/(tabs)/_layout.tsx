import { Tabs } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { t } from '@/lib/i18n';
import { Colors, Typography } from '@/theme/atelier';

/**
 * Libellé centré dans TOUTE la case de l'onglet : même `tabBarIcon: () =>
 * null`, `@react-navigation/bottom-tabs` réserve quand même un emplacement
 * d'icône de taille fixe (`TabBarIcon`, vide mais présent dans le flux), qui
 * pousse le libellé vers le bas de la case. Un overlay `position: absolute`
 * couvrant toute la case ignore cet espace réservé au lieu d'essayer de le
 * compenser.
 */
function CenteredLabel({ color, children }: { color: string; children: string }) {
  return (
    <View style={styles.labelWrap}>
      <Text style={[Typography.label, { color }]} numberOfLines={1}>
        {children}
      </Text>
    </View>
  );
}

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
        tabBarLabel: ({ color, children }) => (
          <CenteredLabel color={color}>{children}</CenteredLabel>
        ),
        // Sans ceci, react-navigation retombe sur `MissingIcon` (le triangle
        // "icône manquante") faute de `tabBarIcon` fourni.
        tabBarIcon: () => null,
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home'),
          tabBarItemStyle: styles.tabItemSeparated,
        }}
      />
      <Tabs.Screen name="stats" options={{ title: t('tabs.stats') }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  labelWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabItemSeparated: {
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: Colors.border,
  },
});
