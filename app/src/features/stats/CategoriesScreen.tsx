import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, Button, EmptyState, Loader, Panel, Screen } from '@/components/ui';
import { fetchFsrsStateStats } from '@/features/review/api';
import { t } from '@/lib/i18n';
import type { FsrsStateStats } from '@/lib/types';
import { Colors, Radius, Spacing } from '@/theme/atelier';

function formatPercent(value: number): string {
  return `${Math.round(value * 100)} %`;
}

interface Row {
  key: string;
  label: string;
  color: string;
  count: number;
}

/** De la moins avancée à la plus mûre : le chemin d'une carte dans FSRS. */
function fsrsRows(stats: FsrsStateStats): Row[] {
  return [
    { key: 'new', label: t('stats.fsrsNew'), color: Colors.textMuted, count: stats.new },
    {
      key: 'learning',
      label: t('stats.fsrsLearning'),
      color: Colors.danger,
      count: stats.learning,
    },
    {
      key: 'relearning',
      label: t('stats.fsrsRelearning'),
      color: Colors.accent,
      count: stats.relearning,
    },
    { key: 'review', label: t('stats.fsrsReview'), color: Colors.success, count: stats.review },
  ];
}

export function CategoriesScreen() {
  const [stats, setStats] = useState<FsrsStateStats | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    try {
      setStats(await fetchFsrsStateStats());
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, []);

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

  const total = stats ? stats.new + stats.learning + stats.review + stats.relearning : 0;

  if (status === 'error' || !stats || total === 0) {
    return (
      <Screen>
        <EmptyState
          title={t('stats.categoriesTitle')}
          body={error ?? t('stats.empty')}
          action={<Button label={t('common.retry')} onPress={() => void load()} />}
        />
      </Screen>
    );
  }

  const rows = fsrsRows(stats);

  return (
    <Screen scroll>
      <AppText variant="title" style={styles.title}>
        {t('stats.categoriesTitle')}
      </AppText>

      <View style={styles.stack}>
        {rows.map((row) => (
          <View
            key={row.key}
            style={[
              styles.stackSegment,
              {
                flexGrow: row.count,
                backgroundColor: row.color,
              },
            ]}
          />
        ))}
      </View>

      {rows.map((row) => {
        const share = row.count / total;
        return (
          <Panel key={row.key} style={styles.panel}>
            <View style={styles.row}>
              <View style={styles.rowLabel}>
                <View style={[styles.dot, { backgroundColor: row.color }]} />
                <AppText>{row.label}</AppText>
              </View>
              <AppText muted variant="label">
                {formatPercent(share)}
              </AppText>
            </View>
            <View style={styles.track}>
              <View
                style={[
                  styles.fill,
                  { width: `${share * 100}%`, backgroundColor: row.color },
                ]}
              />
            </View>
            <AppText muted variant="label" style={styles.rowMeta}>
              {t(row.count === 1 ? 'stats.categoryCardsOne' : 'stats.categoryCardsOther', {
                count: row.count,
              })}
            </AppText>
          </Panel>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  stack: {
    flexDirection: 'row',
    height: 14,
    borderRadius: Radius.sm,
    overflow: 'hidden',
    marginBottom: Spacing.lg,
  },
  stackSegment: {
    height: '100%',
  },
  panel: {
    marginBottom: Spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.sm,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
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
  rowMeta: {
    marginTop: Spacing.xs,
  },
});
