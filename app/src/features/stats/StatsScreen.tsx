import { useRouter } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, Loader, Panel, Screen } from '@/components/ui';
import { fetchGlobalStats, fetchThemeStats } from '@/features/review/api';
import { useAuth } from '@/lib/auth';
import { t, translateTheme } from '@/lib/i18n';
import type { GlobalStats, ThemeStat } from '@/lib/types';
import { Colors, Radius, Spacing } from '@/theme/atelier';

/** Taux de réussite, ou `null` si la carte n'a jamais été tentée. */
function accuracy(correct: number, incorrect: number): number | null {
  const attempts = correct + incorrect;
  return attempts === 0 ? null : correct / attempts;
}

function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

export function StatsScreen() {
  const router = useRouter();
  const { signOut } = useAuth();
  const [global, setGlobal] = useState<GlobalStats | null>(null);
  const [themes, setThemes] = useState<ThemeStat[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      const [globalStats, themeStats] = await Promise.all([
        fetchGlobalStats(),
        fetchThemeStats(),
      ]);
      setGlobal(globalStats);
      setThemes(themeStats);
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (!global || global.cards === 0) {
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

  return (
    <Screen scroll>
      <AppText variant="title" style={styles.title}>
        {t('stats.title')}
      </AppText>

      <Panel>
        <AppText variant="heading">{t('stats.overview')}</AppText>
        <View style={styles.metrics}>
          <Metric label={t('stats.cards')} value={String(global.cards)} />
          <Metric label={t('stats.due')} value={String(global.due)} />
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
          <Metric label="" value="" />
        </View>
      </Panel>

      <Panel style={styles.panel}>
        <AppText variant="heading">{t('stats.byCategory')}</AppText>
        <View style={styles.metrics}>
          <Metric
            label={t('category.inaccuracy')}
            value={String(global.inaccuracies)}
          />
          <Metric
            label={t('category.mistake')}
            value={String(global.mistakes_count)}
          />
          <Metric label={t('category.blunder')} value={String(global.blunders)} />
        </View>
      </Panel>

      <AppText variant="heading" style={styles.sectionTitle}>
        {t('stats.byTheme')}
      </AppText>

      {ranked.map((row) => (
        <ThemeRow
          key={row.theme}
          row={row}
          onTrain={() =>
            router.push({ pathname: '/', params: { theme: row.theme } })
          }
        />
      ))}

      <Button
        label={t('auth.signOut')}
        variant="secondary"
        onPress={() => void signOut()}
        style={styles.signOut}
      />
    </Screen>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.metric}>
      <AppText variant="title">{value}</AppText>
      <AppText muted variant="label">
        {label}
      </AppText>
    </View>
  );
}

function ThemeRow({ row, onTrain }: { row: ThemeStat; onTrain: () => void }) {
  const rate = accuracy(row.correct, row.incorrect);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('stats.trainTheme')}
      onPress={onTrain}
      style={({ pressed }) => [styles.themeRow, pressed && styles.pressed]}>
      <View style={styles.themeHeader}>
        <AppText variant="mono">{translateTheme(row.theme)}</AppText>
        <AppText muted variant="label">
          {rate === null ? t('stats.noAttempts') : formatPercent(rate)}
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
