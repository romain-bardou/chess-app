import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, Loader, Panel, Screen } from '@/components/ui';
import { fetchDueForecast, fetchGlobalStats, fetchThemeStats } from '@/features/review/api';
import { useAuth } from '@/lib/auth';
import { t, translateTheme } from '@/lib/i18n';
import type { DueForecast, GlobalStats, ThemeStat } from '@/lib/types';
import { Colors, Radius, Spacing } from '@/theme/atelier';

/** Dimanche en premier, comme le renvoie `Date#getDay`. */
const WEEKDAY_LABELS = ['Dim.', 'Lun.', 'Mar.', 'Mer.', 'Jeu.', 'Ven.', 'Sam.'];

/** Libellé court d'un jour, ex. « Auj. », « Dem. », « Lun. ». */
function dayLabel(date: string, offset: number): string {
  if (offset === 0) return t('stats.today');
  if (offset === 1) return t('stats.tomorrow');
  return WEEKDAY_LABELS[new Date(`${date}T00:00:00`).getDay()];
}

/** Taux de réussite, ou `null` si la carte n'a jamais été tentée. */
function accuracy(correct: number, incorrect: number): number | null {
  const attempts = correct + incorrect;
  return attempts === 0 ? null : correct / attempts;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

/** Rangées visibles d'emblée dans « Par thème tactique » avant « Voir plus ». */
const THEME_PREVIEW_COUNT = 6;

export function StatsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [themes, setThemes] = useState<ThemeStat[]>([]);
  const [forecast, setForecast] = useState<DueForecast | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);
  const [showAllThemes, setShowAllThemes] = useState(false);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [globalStats, themeStats, dueForecast] = await Promise.all([
        fetchGlobalStats(),
        fetchThemeStats(),
        fetchDueForecast(),
      ]);
      setGlobal(globalStats);
      setThemes(themeStats);
      setForecast(dueForecast);
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

  if (!global || !forecast || global.cards === 0) {
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

  const forecastMax = Math.max(
    1,
    forecast.overdue,
    forecast.later,
    ...forecast.days.map((day) => day.count)
  );

  return (
    <Screen scroll>
      <AppText variant="title" style={styles.title}>
        {t('stats.title')}
      </AppText>

      <Panel>
        <AppText variant="heading">{t('stats.overview')}</AppText>
        <View style={styles.metrics}>
          <Metric label={t('stats.cards')} value={String(global.cards)} />
          <Metric label={t('stats.due')} value={String(global.due)} emphasize />
          <Metric
            label={t('stats.accuracy')}
            value={overall === null ? '—' : formatPercent(overall)}
          />
        </View>
        <View style={styles.metrics}>
          <Metric
            label={t('stats.attempts')}
            value={String(global.correct + global.incorrect)}
          />
          <Metric
            label={t('stats.gamesAnalyzed')}
            value={String(global.games_analyzed)}
          />
          {/* Espaceur muet : aligne cette rangée de deux sur la grille à trois
              colonnes de la rangée du dessus, sans nœud de texte vide. */}
          <View style={styles.metric} />
        </View>
      </Panel>

      <Panel style={styles.panel}>
        <AppText variant="heading">{t('stats.calendarTitle')}</AppText>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.calendar}>
          {forecast.overdue > 0 ? (
            <CalendarDay
              label={t('stats.overdue')}
              count={forecast.overdue}
              maxCount={forecastMax}
              overdue
            />
          ) : null}
          {forecast.days.map((day, offset) => (
            <CalendarDay
              key={day.date}
              label={dayLabel(day.date, offset)}
              count={day.count}
              maxCount={forecastMax}
            />
          ))}
          {forecast.later > 0 ? (
            <CalendarDay
              label={t('stats.later')}
              count={forecast.later}
              maxCount={forecastMax}
            />
          ) : null}
        </ScrollView>
        <Button
          label={t('stats.viewCategories')}
          variant="secondary"
          onPress={() => router.push('/categories')}
          style={styles.viewCategories}
        />
      </Panel>

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

/** Hauteur max de la barre, hors libellé et compte. */
const CALENDAR_BAR_HEIGHT = 56;

function CalendarDay({
  label,
  count,
  maxCount,
  overdue = false,
}: {
  label: string;
  count: number;
  maxCount: number;
  overdue?: boolean;
}) {
  const height = Math.max(2, (count / maxCount) * CALENDAR_BAR_HEIGHT);
  return (
    <View style={styles.calendarDay}>
      <View style={styles.calendarTrack}>
        {count > 0 ? (
          <AppText muted variant="label">
            {count}
          </AppText>
        ) : null}
        <View
          style={[
            styles.calendarBar,
            {
              height,
              backgroundColor: overdue ? Colors.danger : Colors.accent,
            },
          ]}
        />
      </View>
      <AppText muted variant="label" style={styles.calendarLabel}>
        {label}
      </AppText>
    </View>
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
      <AppText variant="title" color={emphasize ? Colors.accent : undefined}>
        {value}
      </AppText>
      <AppText muted variant="label">
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
        {t('stats.themeCards', { count: row.cards })} · {t('stats.due')} {row.due}
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
  viewCategories: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  calendar: {
    marginTop: Spacing.sm,
  },
  calendarDay: {
    alignItems: 'center',
    width: 44,
    marginRight: Spacing.sm,
  },
  calendarTrack: {
    height: CALENDAR_BAR_HEIGHT,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginTop: Spacing.xs,
  },
  calendarBar: {
    width: 20,
    borderRadius: Radius.sm,
  },
  calendarLabel: {
    marginTop: Spacing.xs,
  },
  metrics: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  metric: {
    flex: 1,
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
