import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Chessboard, type BoardMove } from '@/chess/Chessboard';
import { playMove, type Position } from '@/chess/play';
import { ReplayControls } from '@/components/ReplayControls';
import { AppText, Button, EmptyState, Loader, Panel, Screen, Select } from '@/components/ui';
import { fetchRepertoireTree, saveRepertoireReview } from '@/features/repertoire/api';
import {
  ROOT,
  ancestorPath,
  groupByParent,
  pickMyNode,
  pickOpponentNode,
  sideToMoveAt,
} from '@/features/repertoire/tree';
import { useLineReplay } from '@/features/review/useLineReplay';
import { reviewRepertoireNode } from '@/lib/fsrs';
import { t } from '@/lib/i18n';
import type { RepertoireNode } from '@/lib/types';
import { Colors, Spacing } from '@/theme/atelier';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_BOARD_SIZE = 440;
/** Délai avant la réponse adverse simulée, pour qu'on la voie arriver. */
const OPPONENT_DELAY_MS = 450;

type Color = 'white' | 'black';
type Mode = Color | 'random';
type Phase = 'walking' | 'wrong' | 'done';
type TreeStatus = 'idle' | 'loading' | 'ready' | 'error';

/** Tire un camp pour la prochaine carte. Fixe si `mode` est un camp donné. */
function rollColor(mode: Mode): Color {
  if (mode !== 'random') return mode;
  return Math.random() < 0.5 ? 'white' : 'black';
}

interface WrongInfo {
  target: RepertoireNode;
  playedSan: string;
}

/** Rejoue depuis la racine en forçant les mêmes réponses adverses qu'au tour précédent. */
function buildScript(path: RepertoireNode[]): Map<string, RepertoireNode> {
  const picks = new Map<string, RepertoireNode>();
  let parentKey = ROOT;
  for (const node of path) {
    picks.set(parentKey, node);
    parentKey = node.id;
  }
  return picks;
}

export function RepertoireScreen() {
  // Venue d'un tap sur une branche de l'arbre : rejoue cette carte précise
  // plutôt que de tirer une ligne depuis le début.
  const params = useLocalSearchParams<{ nodeId?: string; side?: string }>();
  const startNodeId = params.nodeId;
  const startSide: Color = params.side === 'black' ? 'black' : 'white';
  const appliedStartRef = useRef(false);

  const [mode, setMode] = useState<Mode>(startNodeId ? startSide : 'white');
  const [color, setColor] = useState<Color | null>(null);
  const [nodes, setNodes] = useState<RepertoireNode[]>([]);
  const [treeStatus, setTreeStatus] = useState<TreeStatus>('idle');
  const [treeError, setTreeError] = useState<string | null>(null);

  const [path, setPath] = useState<RepertoireNode[]>([]);
  const [phase, setPhase] = useState<Phase>('walking');
  const [waitingOpponent, setWaitingOpponent] = useState(false);
  const [wrongInfo, setWrongInfo] = useState<WrongInfo | null>(null);
  const [scriptedPicks, setScriptedPicks] = useState<Map<string, RepertoireNode> | null>(
    null
  );
  const [detailsOpen, setDetailsOpen] = useState(true);
  const [variantOpen, setVariantOpen] = useState(false);
  const [startedAt, setStartedAt] = useState(Date.now());
  const [saveError, setSaveError] = useState<string | null>(null);
  const retrySaveRef = useRef<(() => void) | null>(null);

  const childrenMap = useMemo(() => groupByParent(nodes), [nodes]);
  const currentParentKey = path.length ? path[path.length - 1].id : ROOT;
  const currentChildren = useMemo(
    () => childrenMap.get(currentParentKey) ?? [],
    [childrenMap, currentParentKey]
  );
  const currentTurn = currentChildren.length
    ? sideToMoveAt(currentChildren, START_FEN)
    : null;
  const myLetter = color === 'black' ? 'b' : 'w';
  const myTurnNow = phase === 'walking' && currentTurn === myLetter && !waitingOpponent;

  const pickColor = useCallback((next: Color) => {
    setColor(next);
    setScriptedPicks(null);
    setPath([]);
    setPhase('walking');
    setWrongInfo(null);
    setDetailsOpen(true);
    setVariantOpen(false);
    setSaveError(null);
    setTreeStatus('loading');
    setTreeError(null);
    fetchRepertoireTree(next)
      .then((rows) => {
        setNodes(rows);
        setTreeStatus('ready');
      })
      .catch((cause: unknown) => {
        setTreeError(cause instanceof Error ? cause.message : String(cause));
        setTreeStatus('error');
      });
  }, []);

  // Première carte au montage, sur le camp par défaut ("Blancs") : le menu
  // déroulant a toujours une valeur, pas de bouton à taper avant de démarrer.
  // Volontairement une seule fois : le Select et "Suivante" relancent une
  // carte explicitement, cet effet ne doit pas les redéclencher.
  useEffect(() => {
    pickColor(startNodeId ? startSide : rollColor(mode));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Une fois l'arbre du camp visé chargé, saute directement à la carte tapée
  // dans l'arbre : force les mêmes réponses adverses que la vraie ligne pour
  // amener le plateau jusqu'à son parent, sans passer par tout le reste.
  useEffect(() => {
    if (!startNodeId || appliedStartRef.current || treeStatus !== 'ready' || nodes.length === 0) {
      return;
    }
    appliedStartRef.current = true;
    const chain = ancestorPath(nodes, startNodeId);
    setScriptedPicks(buildScript(chain));
    setPath(chain);
    setPhase('walking');
  }, [startNodeId, treeStatus, nodes]);

  // Avance le parcours tout seul tant que c'est le tour de l'adversaire ;
  // s'arrête (en attente d'un coup) dès que c'est le mien, ou termine la
  // ligne quand il n'y a plus de suite enregistrée.
  useEffect(() => {
    if (phase !== 'walking' || !color || treeStatus !== 'ready' || nodes.length === 0) {
      return;
    }
    if (currentChildren.length === 0) {
      setPhase('done');
      return;
    }
    if (currentTurn === myLetter) {
      setStartedAt(Date.now());
      return;
    }
    const chosen = scriptedPicks?.get(currentParentKey) ?? pickOpponentNode(currentChildren);
    setWaitingOpponent(true);
    const timer = setTimeout(() => {
      setPath((previous) => [...previous, chosen]);
      setWaitingOpponent(false);
    }, OPPONENT_DELAY_MS);
    return () => clearTimeout(timer);
  }, [
    phase,
    color,
    treeStatus,
    nodes.length,
    currentChildren,
    currentTurn,
    currentParentKey,
    myLetter,
    scriptedPicks,
  ]);

  const handleMove = useCallback(
    (move: BoardMove) => {
      if (!myTurnNow || currentChildren.length === 0) return;
      const target = pickMyNode(currentChildren);
      const correct = move.san === target.move_san;
      const seconds = (Date.now() - startedAt) / 1000;
      const outcome = reviewRepertoireNode(target, correct, seconds);

      const persist = () => {
        setSaveError(null);
        saveRepertoireReview(target.id, outcome.update).catch((cause: unknown) =>
          setSaveError(cause instanceof Error ? cause.message : String(cause))
        );
      };
      retrySaveRef.current = persist;
      persist();

      if (correct) {
        setPath((previous) => [...previous, target]);
      } else {
        setWrongInfo({ target, playedSan: move.san });
        setDetailsOpen(true);
        setPhase('wrong');
      }
    },
    [myTurnNow, currentChildren, startedAt]
  );

  const handleRestart = useCallback(() => {
    setScriptedPicks(buildScript(path));
    setPath([]);
    setPhase('walking');
    setWrongInfo(null);
    setDetailsOpen(true);
    setVariantOpen(false);
  }, [path]);

  const handleNext = useCallback(() => {
    // Camp aléatoire : chaque nouvelle carte retire un camp, pas seulement
    // une nouvelle réponse adverse — on repart via pickColor (recharge
    // l'arbre si besoin) plutôt que du simple reset ci-dessous.
    if (mode === 'random') {
      pickColor(rollColor('random'));
      return;
    }
    setScriptedPicks(null);
    setPath([]);
    setPhase('walking');
    setWrongInfo(null);
    setDetailsOpen(true);
    setVariantOpen(false);
  }, [mode, pickColor]);

  // Position atteinte en suivant la ligne jouée : chaque nœud ne stocke que
  // la position d'avant son propre coup, donc on les rejoue depuis le début.
  const liveBoard = useMemo<Position>(() => {
    let current: Position = { fen: START_FEN, lastMove: null };
    for (const node of path) {
      if (!node.move_san) break;
      const played = playMove(current.fen, node.move_san);
      if (!played) break;
      current = played;
    }
    return current;
  }, [path]);

  const replayMoves = useMemo(
    () => path.map((node) => ({ san: node.move_san ?? '', uci: '' })),
    [path]
  );
  const replay = useLineReplay({
    fen: START_FEN,
    moves: replayMoves,
    active: phase !== 'walking',
    autoPlay: false,
    initialStep: replayMoves.length,
  });

  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - Spacing.md * 2, MAX_BOARD_SIZE);

  const board =
    phase === 'walking'
      ? liveBoard
      : { fen: replay.frame.fen, lastMove: replay.frame.lastMove };
  const orientation = color === 'black' ? 'b' : 'w';

  return (
    <Screen scroll>
      <Select
        label={t('openings.colorLabel')}
        value={mode}
        options={[
          { value: 'white', label: t('openings.chooseWhite') },
          { value: 'black', label: t('openings.chooseBlack') },
          { value: 'random', label: t('openings.chooseRandom') },
        ]}
        onChange={(next) => {
          setMode(next);
          pickColor(rollColor(next));
        }}
      />
      {mode === 'random' && color ? (
        <AppText muted variant="label" style={styles.playingAs}>
          {t('openings.playingAs', {
            color: t(color === 'white' ? 'openings.chooseWhite' : 'openings.chooseBlack'),
          })}
        </AppText>
      ) : null}

      <View
        style={[
          styles.boardWrapper,
          phase === 'walking' && waitingOpponent && styles.boardWaiting,
        ]}>
        <Chessboard
          fen={board.fen}
          orientation={orientation}
          size={boardSize}
          interactive={phase === 'walking' ? myTurnNow : true}
          lastMove={board.lastMove}
          onMove={phase === 'walking' ? handleMove : replay.explore}
        />
      </View>

      {!color ? null : treeStatus === 'loading' ? (
        <Loader label={t('common.loading')} />
      ) : treeStatus === 'error' ? (
        <EmptyState
          title={t('common.error')}
          body={treeError ?? ''}
          action={<Button label={t('common.retry')} onPress={() => pickColor(color)} />}
        />
      ) : nodes.length === 0 ? (
        <EmptyState
          title={t('openings.emptyTitle')}
          body={t('openings.emptyBody')}
          action={<Button label={t('common.retry')} onPress={() => pickColor(color)} />}
        />
      ) : phase === 'walking' ? (
        <AppText muted style={styles.prompt}>
          {waitingOpponent ? t('openings.opponentThinking') : t('openings.prompt')}
        </AppText>
      ) : (
        <Outcome
          phase={phase}
          wrongInfo={wrongInfo}
          path={path}
          replay={replay}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
          variantOpen={variantOpen}
          onToggleVariant={() => setVariantOpen((open) => !open)}
          onRestart={handleRestart}
          onNext={handleNext}
        />
      )}

      {saveError ? (
        <View style={styles.saveError}>
          <AppText color={Colors.danger} style={styles.saveErrorText}>
            {saveError}
          </AppText>
          <Button
            label={t('common.retry')}
            variant="secondary"
            onPress={() => retrySaveRef.current?.()}
          />
        </View>
      ) : null}
    </Screen>
  );
}

function Outcome({
  phase,
  wrongInfo,
  path,
  replay,
  detailsOpen,
  onToggleDetails,
  variantOpen,
  onToggleVariant,
  onRestart,
  onNext,
}: {
  phase: Phase;
  wrongInfo: WrongInfo | null;
  path: RepertoireNode[];
  replay: ReturnType<typeof useLineReplay>;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  variantOpen: boolean;
  onToggleVariant: () => void;
  onRestart: () => void;
  onNext: () => void;
}) {
  const wrong = phase === 'wrong';
  return (
    <Panel style={styles.outcome}>
      <AppText variant="heading" color={wrong ? Colors.danger : Colors.success}>
        {wrong ? t('openings.wrongTitle') : t('openings.doneTitle')}
      </AppText>

      {wrong && wrongInfo ? (
        <>
          <Button
            label={detailsOpen ? t('openings.showLess') : t('openings.showMore')}
            variant="secondary"
            onPress={onToggleDetails}
            style={styles.detailsToggle}
          />
          {detailsOpen ? (
            <>
              <AppText style={styles.outcomeLine}>
                {t('openings.playedMove', { move: wrongInfo.playedSan })}
              </AppText>
              <AppText style={styles.outcomeLine}>
                {t('openings.expectedMove', { move: wrongInfo.target.move_san ?? '' })}
              </AppText>
            </>
          ) : null}
        </>
      ) : null}

      <ReplayControls replay={replay} />

      <View style={styles.actions}>
        <Button
          label={t('openings.restart')}
          variant="secondary"
          onPress={onRestart}
          style={styles.action}
        />
        <Button label={t('openings.next')} onPress={onNext} style={styles.action} />
      </View>

      <Button
        label={t('openings.variantTitle')}
        variant="secondary"
        onPress={onToggleVariant}
        style={styles.detailsToggle}
      />
      {variantOpen ? (
        <ScrollView style={styles.variantScroll} nestedScrollEnabled>
          {path.map((node, index) => (
            <AppText key={node.id} style={styles.variantMove}>
              {index % 2 === 0
                ? `${Math.floor(index / 2) + 1}. ${node.move_san ?? '?'}`
                : `${Math.floor(index / 2) + 1}… ${node.move_san ?? '?'}`}
            </AppText>
          ))}
        </ScrollView>
      ) : null}
    </Panel>
  );
}

const styles = StyleSheet.create({
  playingAs: {
    marginTop: Spacing.xs,
  },
  boardWrapper: {
    alignItems: 'center',
    marginTop: Spacing.md,
  },
  boardWaiting: {
    opacity: 0.55,
  },
  prompt: {
    marginTop: Spacing.md,
  },
  saveError: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.sm,
    columnGap: Spacing.sm,
  },
  saveErrorText: {
    flex: 1,
  },
  outcome: {
    marginTop: Spacing.sm,
  },
  outcomeLine: {
    marginTop: Spacing.xs,
  },
  detailsToggle: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    columnGap: Spacing.sm,
  },
  action: {
    flex: 1,
  },
  variantScroll: {
    maxHeight: 220,
    marginTop: Spacing.sm,
  },
  variantMove: {
    paddingVertical: Spacing.xs,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
});
