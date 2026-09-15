import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Screen } from '@/components/ui';
import { fetchRepertoireDueCount } from '@/features/repertoire/api';
import { fetchGlobalStats } from '@/features/review/api';
import { accuracy, formatPercent } from '@/lib/format';
import { t } from '@/lib/i18n';
import { Colors, Radius, Spacing } from '@/theme/atelier';

interface DueSnapshot {
  puzzlesDue: number;
  openingsDue: number;
  accuracyLabel: string;
}

/**
 * Tableau de bord d'accueil : total dû aujourd'hui + réussite en avant,
 * les deux modes de travail en tuiles secondaires avec leur propre compte.
 */
export function HomeScreen() {
  const router = useRouter();
  const [snapshot, setSnapshot] = useState<DueSnapshot | null>(null);

  useFocusEffect(
    useCallback(() => {
      let active = true;
      Promise.all([fetchGlobalStats(), fetchRepertoireDueCount()])
        .then(([global, openingsDue]) => {
          if (!active) return;
          const rate = global ? accuracy(global.correct, global.incorrect) : null;
          setSnapshot({
            puzzlesDue: global?.due ?? 0,
            openingsDue,
            accuracyLabel: rate === null ? '—' : formatPercent(rate),
          });
        })
        // Le tableau de bord reste utilisable même si l'instantané ne charge pas.
        .catch(() => setSnapshot(null));
      return () => {
        active = false;
      };
    }, [])
  );

  const totalDue = snapshot ? snapshot.puzzlesDue + snapshot.openingsDue : null;

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
            <Ionicons name="settings-outline" size={22} color={Colors.accent} />
          </Pressable>
        </View>
      </View>

      <View style={styles.hero}>
        <View>
          <AppText color={Colors.accentText} variant="label" style={styles.heroLabel}>
            {t('home.dueToday')}
          </AppText>
          <AppText color={Colors.accentText} variant="title" style={styles.heroValue}>
            {totalDue === null ? '—' : String(totalDue)}
          </AppText>
        </View>
        <View style={styles.heroRing}>
          <AppText color={Colors.accentText} variant="label">
            {snapshot?.accuracyLabel ?? '—'}
          </AppText>
        </View>
      </View>

      <View style={styles.tiles}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('home.puzzlesTitle')}. ${t('home.puzzlesBody')}`}
          onPress={() => router.push('/puzzles')}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
          <AppText variant="heading">{t('home.puzzlesTitle')}</AppText>
          <AppText muted variant="label" style={styles.tileDue}>
            {t('home.dueCount', { count: snapshot ? snapshot.puzzlesDue : '—' })}
          </AppText>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${t('home.openingsTitle')}. ${t('home.openingsBody')}`}
          onPress={() => router.push('/openings')}
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}>
          <AppText variant="heading">{t('home.openingsTitle')}</AppText>
          <AppText muted variant="label" style={styles.tileDue}>
            {t('home.dueCount', { count: snapshot ? snapshot.openingsDue : '—' })}
          </AppText>
        </Pressable>
      </View>
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
    alignItems: 'center',
  },
  settingsButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.xs,
  },
  settingsPressed: {
    opacity: 0.6,
  },
  hero: {
    backgroundColor: Colors.accent,
    borderRadius: Radius.lg,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  heroLabel: {
    opacity: 0.85,
  },
  heroValue: {
    marginTop: Spacing.xs,
  },
  heroRing: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 3,
    borderColor: Colors.accentText,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tiles: {
    flexDirection: 'row',
    columnGap: Spacing.md,
    marginTop: Spacing.md,
  },
  tile: {
    flex: 1,
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  tilePressed: {
    opacity: 0.7,
  },
  tileDue: {
    marginTop: Spacing.xs,
  },
});
