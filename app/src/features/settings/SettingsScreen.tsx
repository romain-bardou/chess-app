import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { AppText, Button, Panel, Screen, Select, Toggle } from '@/components/ui';
import { resetRepertoireProgress } from '@/features/repertoire/api';
import { fetchThemeStats } from '@/features/review/api';
import { t, translateTheme } from '@/lib/i18n';
import {
  AUTO_PLAY_LINE,
  REVIEW_THEME_FILTER,
  SHOW_TREE_ZOOM_CONTROLS,
  SHUFFLE_QUEUE,
  useStoredFlag,
  useStoredValue,
} from '@/lib/settings';
import { Spacing } from '@/theme/atelier';

const ALL_THEMES = '';

type Side = 'white' | 'black';

export function SettingsScreen() {
  const [themeFilter, setThemeFilter] = useStoredValue(REVIEW_THEME_FILTER, ALL_THEMES);
  const [shuffle, setShuffle] = useStoredFlag(SHUFFLE_QUEUE, false);
  const [autoPlayLine, setAutoPlayLine] = useStoredFlag(AUTO_PLAY_LINE, false);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const [resetSide, setResetSide] = useState<Side>('white');
  const [resetting, setResetting] = useState(false);
  const [showTreeZoomControls, setShowTreeZoomControls] = useStoredFlag(
    SHOW_TREE_ZOOM_CONTROLS,
    true
  );

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

  const runReset = (scope: 'current' | 'all') => {
    setResetting(true);
    const task =
      scope === 'all'
        ? Promise.all([resetRepertoireProgress('white'), resetRepertoireProgress('black')])
        : resetRepertoireProgress(resetSide);
    task
      .catch((cause: unknown) =>
        Alert.alert(t('common.error'), cause instanceof Error ? cause.message : String(cause))
      )
      .finally(() => setResetting(false));
  };

  const confirmReset = (scope: 'current' | 'all') => {
    Alert.alert(
      t('openings.resetConfirmTitle'),
      scope === 'all' ? t('openings.resetConfirmBodyAll') : t('openings.resetConfirmBody'),
      [
        { text: t('common.cancel'), style: 'cancel' },
        {
          text: t('openings.resetTree'),
          style: 'destructive',
          onPress: () => runReset(scope),
        },
      ]
    );
  };

  const chooseResetScope = () => {
    Alert.alert(t('openings.resetScopeTitle'), undefined, [
      { text: t('common.cancel'), style: 'cancel' },
      { text: t('openings.resetScopeCurrent'), onPress: () => confirmReset('current') },
      { text: t('openings.resetScopeAll'), onPress: () => confirmReset('all') },
    ]);
  };

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

      <Panel style={styles.panel}>
        <AppText variant="heading">{t('settings.repertoireSection')}</AppText>
        <Select
          label={t('openings.repertoireLabel')}
          value={resetSide}
          options={[
            { value: 'white', label: t('openings.scotch') },
            { value: 'black', label: t('openings.caroKann') },
          ]}
          onChange={setResetSide}
        />
        <Toggle
          label={t('settings.showTreeZoomControls')}
          value={showTreeZoomControls}
          onValueChange={setShowTreeZoomControls}
        />
        <Button
          label={resetting ? t('openings.resetting') : t('openings.resetTree')}
          variant="secondary"
          disabled={resetting}
          onPress={chooseResetScope}
          style={styles.resetButton}
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
  panel: {
    marginTop: Spacing.md,
  },
  resetButton: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
  },
});
