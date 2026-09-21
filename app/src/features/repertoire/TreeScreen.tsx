import { useFocusEffect, useRouter } from 'expo-router';
import * as ScreenOrientation from 'expo-screen-orientation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { AppText, EmptyState, Loader, Screen, Select } from '@/components/ui';
import { fetchOpeningTree } from '@/features/repertoire/api';
import { OPENINGS, OPENING_IDS, type Opening } from '@/features/repertoire/openings';
import { TreeDiagram, TreeLegend } from '@/features/repertoire/TreeDiagram';
import { t } from '@/lib/i18n';
import type { RepertoireNode } from '@/lib/types';
import { Colors, Radius, Spacing } from '@/theme/atelier';

export function TreeScreen() {
  const router = useRouter();
  const [opening, setOpening] = useState<Opening>('scotch');
  const [nodes, setNodes] = useState<RepertoireNode[]>([]);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [error, setError] = useState<string | null>(null);

  // Paysage : la largeur gagnée sert au diagramme, pas au bandeau du haut —
  // titre et légende passent en formats compacts pour lui laisser la place.
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const load = useCallback((next: Opening) => {
    setStatus('loading');
    setError(null);
    fetchOpeningTree(next)
      .then((rows) => {
        setNodes(rows);
        setStatus('ready');
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus('error');
      });
  }, []);

  // Un seul chargement au montage ; changer d'ouverture recharge explicitement
  // via le Select, pas besoin d'un rechargement au retour sur l'écran comme
  // les stats (l'arbre ne change pas pendant une session de révision).
  useEffect(() => {
    load(opening);
  }, []);

  // Une variante = une fin de ligne (`is_book_end`) ; "complétée" reprend
  // exactement le critère du ✓ affiché dans l'arbre (voir TreeDiagram).
  const { completed, total } = useMemo(() => {
    const bookEnds = nodes.filter((node) => node.is_book_end);
    const done = bookEnds.filter((node) => node.box === 'mastered').length;
    return { completed: done, total: bookEnds.length };
  }, [nodes]);

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
      <View style={[styles.header, isLandscape && styles.headerCompact]}>
        <View style={styles.headerRow}>
          <AppText style={[styles.title, isLandscape && styles.titleCompact]}>
            {t('openings.treeTitle')}
          </AppText>
          <Select
            label={t('openings.repertoireLabel')}
            value={opening}
            hideLabel
            options={OPENING_IDS.map((id) => ({ value: id, label: t(OPENINGS[id].labelKey) }))}
            onChange={(next) => {
              setOpening(next);
              load(next);
            }}
            style={[styles.headerButton, isLandscape && styles.headerButtonCompact]}
          />
        </View>
        {status === 'ready' && total > 0 ? (
          <AppText muted style={styles.progress}>
            {t('openings.treeProgress', { done: completed, total })}
          </AppText>
        ) : null}
      </View>

      {status === 'loading' ? (
        <Loader label={t('common.loading')} />
      ) : status === 'error' ? (
        <EmptyState title={t('common.error')} body={error ?? ''} />
      ) : nodes.length === 0 ? (
        <EmptyState title={t('openings.treeTitle')} body={t('openings.emptyBody')} />
      ) : (
        <View style={styles.diagramArea}>
          <TreeLegend />
          <TreeDiagram
            nodes={nodes}
            onSelectNode={(node) =>
              router.push({ pathname: '/openings', params: { nodeId: node.id, opening } })
            }
          />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: {
    paddingTop: Spacing.xs,
    marginBottom: Spacing.sm,
    rowGap: 2,
  },
  // Paysage = écran court : les deux lignes restent, juste plus petites.
  headerCompact: {
    paddingTop: 2,
    marginBottom: 2,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontSize: 21,
    fontWeight: '700',
  },
  titleCompact: {
    fontSize: 15,
  },
  progress: {
    fontSize: 11,
  },
  headerButton: {
    borderWidth: 1,
    borderColor: Colors.accent,
    borderRadius: Radius.lg,
    paddingVertical: 3,
    paddingHorizontal: Spacing.sm,
  },
  headerButtonCompact: {
    paddingVertical: 1,
    paddingHorizontal: Spacing.sm,
  },
  diagramArea: {
    flex: 1,
  },
});
