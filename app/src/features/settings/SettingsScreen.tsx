import { useEffect, useState } from 'react';
import { StyleSheet } from 'react-native';

import { AppText, Panel, Screen, Select, Toggle } from '@/components/ui';
import { fetchThemeStats } from '@/features/review/api';
import { t, translateTheme } from '@/lib/i18n';
import {
  AUTO_PLAY_LINE,
  REVIEW_THEME_FILTER,
  SHUFFLE_QUEUE,
  useStoredFlag,
  useStoredValue,
} from '@/lib/settings';
import { Spacing } from '@/theme/atelier';

const ALL_THEMES = '';

export function SettingsScreen() {
  const [themeFilter, setThemeFilter] = useStoredValue(REVIEW_THEME_FILTER, ALL_THEMES);
  const [shuffle, setShuffle] = useStoredFlag(SHUFFLE_QUEUE, false);
  const [autoPlayLine, setAutoPlayLine] = useStoredFlag(AUTO_PLAY_LINE, false);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);

  useEffect(() => {
    fetchThemeStats()
      .then((rows) =>
        setAvailableThemes(rows.filter((row) => row.due > 0).map((row) => row.theme))
      )
      // Le choix reste utilisable même si la liste des thèmes ne charge pas.
      .catch(() => setAvailableThemes([]));
  }, []);

  const themeOptions = [
    { value: ALL_THEMES, label: t('common.all') },
    ...availableThemes.map((theme) => ({ value: theme, label: translateTheme(theme) })),
  ];

  const orderOptions = [
    { value: 'game', label: t('review.orderByGame') },
    { value: 'random', label: t('review.orderRandom') },
  ];

  return (
    <Screen>
      <AppText variant="title" style={styles.title}>
        {t('settings.title')}
      </AppText>

      <Panel>
        <AppText variant="heading">{t('settings.reviewSection')}</AppText>
        <Select
          label={t('settings.themeLabel')}
          value={themeFilter}
          options={themeOptions}
          onChange={setThemeFilter}
        />
        <Select
          label={t('settings.orderLabel')}
          value={shuffle ? 'random' : 'game'}
          options={orderOptions}
          onChange={(value) => setShuffle(value === 'random')}
        />
        <Toggle
          label={t('review.autoPlayLine')}
          value={autoPlayLine}
          onValueChange={setAutoPlayLine}
        />
      </Panel>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
});
