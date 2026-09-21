import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, Loader, Panel, Screen } from '@/components/ui';
import { fetchOpeningsBoxStats } from '@/features/repertoire/api';
import { fetchGlobalStats, fetchMistakeBoxStats, fetchThemeStats } from '@/features/review/api';
import { useAuth } from '@/lib/auth';
import { accuracy, formatPercent } from '@/lib/format';
import { t, translateTheme, type TranslationKey } from '@/lib/i18n';
import type { BoxStats, GlobalStats, ThemeStat } from '@/lib/types';
import { Colors, Radius, Spacing, Typography } from '@/theme/atelier';

/** Ordre d'affichage des boîtes dans le graphique (voir `ReviewBox`). */
const BOX_ORDER: { key: keyof BoxStats; labelKey: TranslationKey }[] = [
  { key: 'new', labelKey: 'stats.boxNew' },
  { key: 'unvalidated', labelKey: 'stats.boxUnvalidated' },
  { key: 'validated', labelKey: 'stats.boxValidated' },
  { key: 'mastered', labelKey: 'stats.boxMastered' },
];

/** Rangées visibles d'emblée dans « Par thème tactique » avant « Voir plus ». */
const THEME_PREVIEW_COUNT = 6;

export function StatsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [themes, setThemes] = useState<ThemeStat[]>([]);
  const [puzzleBoxStats, setPuzzleBoxStats] = useState<BoxStats | null>(null);
  const [openingsBoxStats, setOpeningsBoxStats] = useState<BoxStats | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [showAllThemes, setShowAllThemes] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [globalStats, themeStats, mistakeBoxStats, openingsStats] = await Promise.all([
        fetchGlobalStats(),
        fetchThemeStats(),
        fetchMistakeBoxStats(),
        fetchOpeningsBoxStats(),
      ]);
      setGlobal(globalStats);
      setThemes(themeStats);
      setPuzzleBoxStats(mistakeBoxStats);
      setOpeningsBoxStats(openingsStats);
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, []);

  // Sur focus plutôt qu'au montage : l'onglet reste monté par Expo Router, un
  // retour depuis une session de révision ne rechargerait jamais les stats
  // sinon.
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  if (status === 'loading') {
    return (
      <Screen>
        <Loader label={t('common.loading')} />
      </Screen>
    );
  }

  if (status === 'error') {
    return (
      <Screen>
        <EmptyState
          title={t('common.error')}
          body={error ?? ''}
          action={<Button label={t('common.retry')} onPress={() => void load()} />}
        />
      </Screen>
    );
  }

  if (!global || !puzzleBoxStats || !openingsBoxStats || global.cards === 0) {
    return (
      <Screen>
        <EmptyState
          title={t('stats.title')}
          body={t('stats.empty')}
          action={<Button label={t('common.retry')} onPress={() => void load()} />}
        />
      </Screen>
    );
  }

  const overall = accuracy(global.correct, global.incorrect);

  // Les thèmes déjà travaillés passent devant, du plus faible au plus solide :
  // c'est là qu'il y a quelque chose à corriger.
  const ranked = [...themes].sort((a, b) => {
    const left = accuracy(a.correct, a.incorrect);
    const right = accuracy(b.correct, b.incorrect);
    if (left === null && right === null) return b.cards - a.cards;
    if (left === null) return 1;
    if (right === null) return -1;
    return left - right;
  });
  // Un thème jamais tenté n'est pas une performance faible : le mélanger au
  // classement laisserait croire à un score de 0 %.
  const attempted = ranked.filter(
    (row) => accuracy(row.correct, row.incorrect) !== null
  );
  const untried = ranked.filter(
    (row) => accuracy(row.correct, row.incorrect) === null
  );
  const visibleAttempted = showAllThemes
    ? attempted
    : attempted.slice(0, THEME_PREVIEW_COUNT);
  const hiddenCount = attempted.length - visibleAttempted.length;

  return (
    <Screen scroll>
      <AppText variant="title" style={styles.title}>
        {t('stats.title')}
      </AppText>

      <Panel>
        <AppText variant="heading">{t('stats.overview')}</AppText>
        <View style={styles.metrics}>
          <Metric label={t('stats.gamesAnalyzed')} value={String(global.games_analyzed)} />
          <Metric label={t('stats.cards')} value={String(global.cards)} />
          <Metric
            label={t('stats.accuracy')}
            value={overall === null ? '—' : formatPercent(overall)}
          />
        </View>
        {attempted.length > 0 ? (
          <AppText muted variant="label" style={styles.weakestTheme}>
            {t('stats.weakestTheme', {
              theme: translateTheme(attempted[0].theme),
              rate: formatPercent(accuracy(attempted[0].correct, attempted[0].incorrect) ?? 0),
            })}
          </AppText>
        ) : null}
        <AppText muted variant="label" style={styles.weakestTheme}>
          {t('stats.openingsMastered', {
            mastered: openingsBoxStats.mastered,
            total: BOX_ORDER.reduce((sum, box) => sum + openingsBoxStats[box.key], 0),
          })}
        </AppText>
      </Panel>

      <Panel style={styles.panel}>
        <AppText variant="heading">{t('stats.boxesTitle')}</AppText>
        <BoxChart puzzles={puzzleBoxStats} openings={openingsBoxStats} />
      </Panel>

      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('stats.repertoireTreeTitle')}. ${t('stats.repertoireTreeBody')}`}
        onPress={() => router.push('/openings-tree')}
        style={({ pressed }) => [styles.treeCard, pressed && styles.pressed]}>
        <AppText variant="heading">{t('stats.repertoireTreeTitle')}</AppText>
        <AppText muted style={styles.treeCardBody}>
          {t('stats.repertoireTreeBody')}
        </AppText>
      </Pressable>

      <AppText variant="heading" style={styles.sectionTitle}>
        {t('stats.byTheme')}
      </AppText>

      {visibleAttempted.map((row) => (
        <ThemeRow
          key={row.theme}
          row={row}
          onTrain={() =>
            router.push({ pathname: '/puzzles', params: { theme: row.theme } })
          }
        />
      ))}

      {hiddenCount > 0 ? (
        <Button
          label={t('stats.showMoreThemes', { count: hiddenCount })}
          variant="secondary"
          onPress={() => setShowAllThemes(true)}
          style={styles.showMore}
        />
      ) : null}

      {untried.length > 0 ? (
        <>
          <AppText muted variant="label" style={styles.sectionTitle}>
            {t('stats.untriedThemes')}
          </AppText>
          {untried.map((row) => (
            <ThemeRow
              key={row.theme}
              row={row}
              onTrain={() =>
                router.push({ pathname: '/puzzles', params: { theme: row.theme } })
              }
            />
          ))}
        </>
      ) : null}

      <Button
        label={t('auth.signOut')}
        variant="secondary"
        onPress={() =>
          Alert.alert(t('auth.signOutConfirm'), '', [
            { text: t('common.cancel'), style: 'cancel' },
            {
              text: t('auth.signOut'),
              style: 'destructive',
              onPress: () => void signOut(),
            },
          ])
        }
        style={styles.signOut}
      />
    </Screen>
  );
}

function Metric({
  label,
  value,
  emphasize = false,
}: {
  label: string;
  value: string;
  /** Ce chiffre pilote l'action à mener maintenant : il tranche sur les 7 autres. */
  emphasize?: boolean;
}) {
  return (
    <View style={styles.metric}>
      <AppText
        variant="title"
        color={emphasize ? Colors.accent : undefined}
        style={styles.metricValue}>
        {value}
      </AppText>
      <AppText muted variant="label" style={styles.metricLabel}>
        {label}
      </AppText>
    </View>
  );
}

/** Hauteur max d'une colonne, hors compte au-dessus. */
const BOX_CHART_BAR_HEIGHT = 56;
/** Place réservée au compte, même quand la colonne atteint sa hauteur max. */
const BOX_CHART_COUNT_HEIGHT = 18;

/** Deux colonnes par boîte — puzzles et ouvertures — sur la même échelle. */
function BoxChart({ puzzles, openings }: { puzzles: BoxStats; openings: BoxStats }) {
  const max = Math.max(
    1,
    ...BOX_ORDER.map((box) => Math.max(puzzles[box.key], openings[box.key]))
  );
  const barHeight = (count: number) => Math.max(2, (count / max) * BOX_CHART_BAR_HEIGHT);

  return (
    <View>
      <View style={styles.chartRow}>
        {BOX_ORDER.map((box) => (
          <View key={box.key} style={styles.chartGroup}>
            <View style={styles.chartBars}>
              <View style={styles.chartTrack}>
                <ChartCount value={puzzles[box.key]} />
                <View
                  style={[
                    styles.chartBar,
                    { height: barHeight(puzzles[box.key]), backgroundColor: Colors.accent },
                  ]}
                />
              </View>
              <View style={styles.chartTrack}>
                <ChartCount value={openings[box.key]} />
                <View
                  style={[
                    styles.chartBar,
                    { height: barHeight(openings[box.key]), backgroundColor: Colors.success },
                  ]}
                />
              </View>
            </View>
            <AppText muted variant="label" style={styles.chartGroupLabel}>
              {t(box.labelKey)}
            </AppText>
          </View>
        ))}
      </View>
      <View style={styles.chartLegend}>
        <ChartLegendItem color={Colors.accent} label={t('stats.legendPuzzles')} />
        <ChartLegendItem color={Colors.success} label={t('stats.legendOpenings')} />
      </View>
    </View>
  );
}

/** Compte au-dessus d'une colonne : police réduite d'un cran à 3 chiffres, et
 * jamais de retour à la ligne — `chartTrack` n'a plus de largeur fixe pour ça. */
function ChartCount({ value }: { value: number }) {
  if (value === 0) return null;
  return (
    <AppText
      muted
      variant="label"
      numberOfLines={1}
      style={[styles.chartCount, value >= 100 && styles.chartCountSmall]}>
      {value}
    </AppText>
  );
}

function ChartLegendItem({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { backgroundColor: color }]} />
      <AppText muted style={styles.legendLabel}>
        {label}
      </AppText>
    </View>
  );
}

function ThemeRow({ row, onTrain }: { row: ThemeStat; onTrain: () => void }) {
  const rate = accuracy(row.correct, row.incorrect);
  const rateLabel = rate === null ? t('stats.noAttempts') : formatPercent(rate);
  return (
    <Pressable
      accessibilityRole="button"
      // Le libellé explicite ne redit pas juste le texte visible : sans lui,
      // chaque rangée s'annoncerait avec le même intitulé générique.
      accessibilityLabel={`${translateTheme(row.theme)}, ${rateLabel}. ${t('stats.trainTheme')}`}
      onPress={onTrain}
      style={({ pressed }) => [styles.themeRow, pressed && styles.pressed]}>
      <View style={styles.themeHeader}>
        <AppText
          variant="mono"
          numberOfLines={1}
          style={styles.themeName}>
          {translateTheme(row.theme)}
        </AppText>
        <AppText muted variant="label">
          {rateLabel}
        </AppText>
      </View>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${(rate ?? 0) * 100}%`,
              backgroundColor: rate !== null && rate < 0.6 ? Colors.danger : Colors.success,
            },
          ]}
        />
      </View>
      <AppText muted variant="label" style={styles.themeMeta}>
        {t('stats.themeCards', { count: row.cards })} · {t('stats.themeMastered', { count: row.mastered })}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  title: {
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  panel: {
    marginTop: Spacing.md,
  },
  metrics: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  weakestTheme: {
    marginTop: Spacing.sm,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
  },
  metricValue: {
    textAlign: 'center',
  },
  metricLabel: {
    textAlign: 'center',
  },
  chartRow: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  chartGroup: {
    flex: 1,
    alignItems: 'center',
  },
  chartBars: {
    flexDirection: 'row',
    columnGap: Spacing.xs,
  },
  chartTrack: {
    // + la hauteur du compte : sinon, quand la colonne atteint sa hauteur
    // max, le compte au-dessus n'a plus de place et se retrouve tronqué.
    height: BOX_CHART_BAR_HEIGHT + BOX_CHART_COUNT_HEIGHT,
    // Pas de largeur fixe ici : à 3 chiffres, le compte est plus large que la
    // barre (20) et ne doit pas se faire tasser en retour à la ligne.
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  chartBar: {
    width: 20,
    borderRadius: Radius.sm,
  },
  chartCount: {
    flexShrink: 0,
  },
  chartCountSmall: {
    fontSize: Typography.label.fontSize - 1,
  },
  chartGroupLabel: {
    marginTop: Spacing.xs,
    textAlign: 'center',
  },
  chartLegend: {
    flexDirection: 'row',
    justifyContent: 'center',
    columnGap: Spacing.md,
    marginTop: Spacing.sm,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 3,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.sm,
  },
  legendLabel: {
    fontSize: 10,
  },
  treeCard: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginTop: Spacing.md,
  },
  treeCardBody: {
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    marginTop: Spacing.lg,
    marginBottom: Spacing.sm,
  },
  themeRow: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
    marginBottom: Spacing.sm,
  },
  pressed: {
    opacity: 0.7,
  },
  themeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  themeName: {
    flexShrink: 1,
    marginRight: Spacing.sm,
  },
  showMore: {
    alignSelf: 'flex-start',
    marginBottom: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  track: {
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.border,
    marginTop: Spacing.sm,
    overflow: 'hidden',
  },
  fill: {
    height: '100%',
    borderRadius: 3,
  },
  themeMeta: {
    marginTop: Spacing.xs,
  },
  signOut: {
    marginTop: Spacing.lg,
  },
});
