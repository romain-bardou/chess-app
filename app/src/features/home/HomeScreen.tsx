import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { t } from '@/lib/i18n';
import { Colors, Radius, Spacing } from '@/theme/atelier';

/**
 * Choix du mode de travail. Un seul mode existe pour l'instant (puzzles) ;
 * la révision d'ouvertures rejoindra cet écran une fois le générateur phase 2
 * (repertoire_nodes) construit.
 */
export function HomeScreen() {
  const router = useRouter();

  return (
    <Screen>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <AppText variant="title">{t('home.title')}</AppText>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('home.settings')}
            onPress={() => router.push('/settings')}
            hitSlop={12}
            style={({ pressed }) => [
              styles.settingsButton,
              pressed && styles.settingsPressed,
            ]}>
            <AppText color={Colors.accent} variant="label">
              {t('home.settings')}
            </AppText>
          </Pressable>
        </View>
        <AppText muted style={styles.subtitle}>
          {t('home.subtitle')}
        </AppText>
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('home.puzzlesTitle')}. ${t('home.puzzlesBody')}`}
        onPress={() => router.push('/puzzles')}
        style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}>
        <AppText variant="heading">{t('home.puzzlesTitle')}</AppText>
        <AppText muted style={styles.cardBody}>
          {t('home.puzzlesBody')}
        </AppText>
        <AppText color={Colors.accent} variant="label" style={styles.cardCta}>
          {t('home.enter')} →
        </AppText>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.sm,
    marginBottom: Spacing.lg,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'baseline',
  },
  settingsButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  settingsPressed: {
    opacity: 0.6,
  },
  subtitle: {
    marginTop: Spacing.xs,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  cardPressed: {
    opacity: 0.7,
  },
  cardBody: {
    marginTop: Spacing.xs,
  },
  cardCta: {
    marginTop: Spacing.md,
  },
});
