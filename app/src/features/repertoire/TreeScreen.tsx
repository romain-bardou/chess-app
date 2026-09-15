import { useFocusEffect, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText, EmptyState, Loader, Screen, Select } from '@/components/ui';
import { fetchRepertoireTree } from '@/features/repertoire/api';
import { TreeDiagram, TreeLegend } from '@/features/repertoire/TreeDiagram';
import { t } from '@/lib/i18n';
import type { RepertoireNode } from '@/lib/types';
import { Spacing } from '@/theme/atelier';

type Side = 'white' | 'black';

export function TreeScreen() {
  const router = useRouter();
  const [side, setSide] = useState<Side>('white');
  const [nodes, setNodes] = useState<RepertoireNode[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback((next: Side) => {
    setStatus('loading');
    setError(null);
    fetchRepertoireTree(next)
      .then((rows) => {
        setNodes(rows);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      });
  }, []);

  // Un seul chargement au montage ; changer de camp recharge explicitement
  // via le Select, pas besoin d'un rechargement au retour sur l'écran comme
  // les stats (l'arbre ne change pas pendant une session de révision).
  useEffect(() => {
    load(side);
  }, []);

  // L'arbre profite du paysage (plus large que haut) ; déverrouille tant que
  // l'écran a le focus, reverrouille portrait dès qu'on le quitte.
  useFocusEffect(
    useCallback(() => {
      void ScreenOrientation.unlockAsync();
      return () => {
        void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
      };
    }, [])
  );

  return (
    <Screen>
      <AppText variant="title" style={styles.title}>
        {t('openings.treeTitle')}
      </AppText>

      <Select
        label={t('openings.colorLabel')}
        value={side}
        options={[
          { value: 'white', label: t('openings.chooseWhite') },
          { value: 'black', label: t('openings.chooseBlack') },
        ]}
        onChange={(next) => {
          setSide(next);
          load(next);
        }}
      />

      {status === 'loading' ? (
        <Loader label={t('common.loading')} />
      ) : status === 'error' ? (
        <EmptyState title={t('common.error')} body={error ?? ''} />
      ) : nodes.length === 0 ? (
        <EmptyState title={t('openings.treeTitle')} body={t('openings.emptyBody')} />
      ) : (
        <View style={styles.diagramArea}>
          <AppText muted variant="label" style={styles.count}>
            {t('openings.treeCount', { count: nodes.length })}
          </AppText>
          <TreeLegend />
          <TreeDiagram
            nodes={nodes}
            onSelectNode={(node) =>
              router.push({ pathname: '/openings', params: { nodeId: node.id, side } })
            }
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: {
    paddingTop: Spacing.sm,
    marginBottom: Spacing.md,
  },
  diagramArea: {
    flex: 1,
    marginTop: Spacing.md,
  },
  count: {
    marginBottom: Spacing.sm,
  },
});
