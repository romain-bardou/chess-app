import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';

import { Chessboard, type BoardMove } from '@/chess/Chessboard';
import { uciSquares } from '@/chess/play';
import { ReplayControls } from '@/components/ReplayControls';
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Loader,
  Panel,
  Screen,
} from '@/components/ui';
import { saveReview } from '@/features/review/api';
import { bestMoveSan } from '@/features/review/grading';
import { useLineReplay, type LineReplay } from '@/features/review/useLineReplay';
import { usePuzzleRun } from '@/features/review/usePuzzleRun';
import { useReviewQueue } from '@/features/review/useReviewQueue';
import { GRADE_LABELS, reviewMistake } from '@/lib/fsrs';
import { t, translateTheme, type TranslationKey } from '@/lib/i18n';
import {
  AUTO_PLAY_LINE,
  REVIEW_THEME_FILTER,
  SHUFFLE_QUEUE,
  useStoredFlag,
  useStoredValue,
} from '@/lib/settings';
import type { LineMove, Mistake, SolutionGain } from '@/lib/types';
import { Colors, Radius, Spacing } from '@/theme/atelier';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_BOARD_SIZE = 440;

type Phase = 'solving' | 'correct' | 'wrong';

/**
 * Variante montrée après un échec : mon coup, la réfutation du coup de partie,
 * ou la solution.
 */
type ReplaySource = 'attempt' | 'punishment' | 'solution';

interface Attempt {
  correct: boolean;
  gradeLabel: string;
  playedSan: string;
  /** Le coup tenté, pour l'ouvrir comme premier coup de la variante. */
  move: LineMove | null;
  /** D'où il a été joué : au milieu d'une ligne, ce n'est plus la carte. */
  fen: string;
}

/** Points gagnés par la solution, affichés à côté du trait à jouer. */
function pointsLabel(gain: SolutionGain | null): string | null {
  if (!gain || gain.type !== 'material') return null;
  return t(gain.value === 1 ? 'review.pointsOne' : 'review.pointsOther', {
    value: gain.value,
  });
}

export function ReviewScreen({ initialTheme = null }: { initialTheme?: string | null }) {
  // Un thème choisi depuis les Stats (initialTheme) prime sur le réglage par
  // défaut ; sinon la file suit le filtre posé dans Réglages.
  const [defaultThemeFilter] = useStoredValue(REVIEW_THEME_FILTER, '');
  const theme = initialTheme ?? (defaultThemeFilter || null);
  // Les cartes neuves arrivent groupées par partie, dans l'ordre des coups :
  // pratique pour revoir une partie, trop indicatif pour tester la mémoire.
  const [shuffle] = useStoredFlag(SHUFFLE_QUEUE, false);
  const queue = useReviewQueue(theme, shuffle);
  const current = queue.current;

  const [phase, setPhase] = useState<Phase>('solving');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [replaySource, setReplaySource] = useState<ReplaySource>('punishment');
  // L'issue (verdict + coups) s'affiche seule ; la variante explorable ne
  // s'ouvre qu'à la demande, pour ne pas noyer le verdict sous les contrôles.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Après une erreur, la variante attend le joueur ; ce réglage la déroule
  // tout de suite pour qui préfère voir la suite sans rien demander.
  const [autoPlayLine] = useStoredFlag(AUTO_PLAY_LINE, false);
  // État (pas une ref) : `ElapsedLabel` en a besoin comme prop stable pour
  // faire tourner son propre chrono sans rerendre tout l'écran chaque
  // seconde — l'échiquier SVG est trop coûteux pour ça.
  const [startedAt, setStartedAt] = useState(Date.now());
  /** Durée figée à afficher une fois la réponse donnée. */
  const finalSecondsRef = useRef(0);
  /** Rejoue le dernier enregistrement raté ; posé à chaque tentative. */
  const retrySaveRef = useRef<(() => void) | null>(null);

  // Le chrono démarre à l'affichage de la position, pas au premier contact.
  const run = usePuzzleRun(current);

  useEffect(() => {
    setPhase('solving');
    setAttempt(null);
    setReplaySource('punishment');
    setDetailsOpen(false);
    setSaveError(null);
  }, [current?.id]);

  // Le chrono part quand la position à résoudre est posée, pas pendant que le
  // dernier coup adverse se joue : cette seconde-là n'est pas de la réflexion.
  useEffect(() => {
    if (!run.ready) return;
    setStartedAt(Date.now());
  }, [run.ready, current?.id]);

  const replayLine = useMemo(() => {
    if (!current) return { fen: START_FEN, moves: [] as LineMove[], step: 0 };
    if (replaySource === 'solution') {
      return { fen: current.fen, moves: current.solution ?? [], step: 0 };
    }
    // Mon coup ouvre la variante : on le voit se poser au lieu de le deviner.
    if (replaySource === 'attempt') {
      return {
        fen: attempt?.fen || current.fen,
        moves: attempt?.move ? [attempt.move] : [],
        step: 1,
      };
    }
    // La réfutation part de ma position : on rejoue d'abord mon coup.
    return {
      fen: current.fen,
      moves: [
        { san: current.move_played, uci: '' },
        ...current.punishment_pv,
      ] as LineMove[],
      step: 1,
    };
  }, [attempt, current, replaySource]);

  const replay = useLineReplay({
    fen: replayLine.fen,
    moves: replayLine.moves,
    active: phase === 'wrong',
    autoPlay: autoPlayLine,
    initialStep: replayLine.step,
  });

  const handleMove = useCallback(
    (move: BoardMove) => {
      if (!current || phase !== 'solving') return;

      // Le puzzle va jusqu'au gain : tant que la ligne continue, il n'y a rien
      // à noter, on attend la réponse adverse et le coup suivant.
      const verdict = run.play(move);
      if (verdict === 'progress') return;

      const correct = verdict === 'solved';
      const seconds = (Date.now() - startedAt) / 1000;
      const outcome = reviewMistake(current, correct, seconds);

      setAttempt({
        correct,
        gradeLabel: GRADE_LABELS[outcome.grade],
        playedSan: move.san,
        move: {
          san: move.san,
          uci: move.from + move.to + (move.promotion ?? ''),
        },
        fen: run.fen,
      });
      // Un coup raté ouvre sa propre variante — sauf s'il est celui de la
      // partie : la réfutation enregistrée le prolonge, et vaut mieux qu'un
      // coup isolé. Repli sur ce qui existe vraiment : une fiche sans
      // réfutation ni solution enregistrées ne doit pas pointer sur une
      // source vide (l'onglet correspondant ne s'afficherait même pas).
      const isGameMove =
        run.moveNumber === 1 && move.san === current.move_played;
      const hasPunishment = current.punishment_pv.length > 0;
      const hasSolution = (current.solution?.length ?? 0) > 0;
      const source: ReplaySource =
        !correct && !isGameMove
          ? 'attempt'
          : hasPunishment
            ? 'punishment'
            : hasSolution
              ? 'solution'
              : 'attempt';
      setReplaySource(source);
      finalSecondsRef.current = Math.floor(seconds);
      setPhase(correct ? 'correct' : 'wrong');

      const persist = () => {
        setSaveError(null);
        saveReview(current.id, outcome.update).catch((cause: unknown) =>
          setSaveError(cause instanceof Error ? cause.message : String(cause))
        );
      };
      retrySaveRef.current = persist;
      persist();
    },
    // `run.play`/`run.fen`/`run.moveNumber` plutôt que `run` : l'objet que
    // rend `usePuzzleRun` est reconstruit à chaque rendu, ce qui donnerait à
    // `handleMove` une nouvelle référence à chaque fois et défairait la
    // mémoïsation de `Chessboard` pour rien.
    [current, phase, run.play, run.fen, run.moveNumber, startedAt]
  );

  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - Spacing.md * 2, MAX_BOARD_SIZE);

  // Le dernier coup adverse situe la position : sans lui, on cherche ce qui
  // vient de changer avant de chercher le bon coup. Mémoïsé pour garder
  // `lastMove` référentiellement stable — sinon `Chessboard` (mémoïsé)
  // rerendrait à chaque frappe du chrono ou changement d'état sans rapport.
  const previousSquares = useMemo(
    () => uciSquares(current?.previous_move?.uci),
    [current?.previous_move?.uci]
  );

  if (queue.status === 'loading' && !current) {
    return (
      <Screen>
        <Loader label={t('common.loading')} />
      </Screen>
    );
  }

  if (queue.status === 'error') {
    return (
      <Screen>
        <EmptyState
          title={t('common.error')}
          body={queue.error ?? ''}
          action={<Button label={t('common.retry')} onPress={queue.reload} />}
        />
      </Screen>
    );
  }

  if (!current) {
    return (
      <Screen>
        <EmptyState
          title={t('review.emptyTitle')}
          body={theme ? t('review.emptyThemeBody') : t('review.emptyBody')}
          action={<Button label={t('common.retry')} onPress={queue.reload} />}
        />
      </Screen>
    );
  }

  const solverColor = current.fen.split(' ')[1] === 'w' ? 'w' : 'b';
  const points = pointsLabel(current.solution_gain);
  const board =
    phase === 'wrong'
      ? {
          fen: replay.frame.fen,
          lastMove:
            replay.frame.lastMove ?? (replay.step === 0 ? previousSquares : null),
        }
      : { fen: run.fen, lastMove: run.lastMove };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="heading">
          {t(
            queue.remaining === 1 ? 'review.remainingOne' : 'review.remainingOther',
            { count: queue.remaining }
          )}
        </AppText>
        <ElapsedLabel
          active={phase === 'solving' && run.ready}
          startedAt={startedAt}
          frozenSeconds={finalSecondsRef.current}
        />
      </View>

      <View
        style={[
          styles.boardWrapper,
          // Le tampon adverse n'a pas d'autre signal : l'échiquier se ternit
          // le temps que la réponse se joue, pour ne pas passer pour figé.
          phase === 'solving' && run.waiting && styles.boardWaiting,
        ]}>
        <Chessboard
          fen={board.fen}
          orientation={solverColor}
          size={boardSize}
          // Après l'échec, l'échiquier n'est plus une question mais un
          // brouillon : on y joue ce qu'on veut, des deux camps.
          interactive={phase === 'wrong' || (phase === 'solving' && !run.waiting)}
          lastMove={board.lastMove}
          onMove={phase === 'wrong' ? replay.explore : handleMove}
        />
      </View>

      <View style={styles.turn}>
        <AppText variant="heading">
          {solverColor === 'w' ? t('review.whiteToPlay') : t('review.blackToPlay')}
        </AppText>
        {phase !== 'solving' && points ? (
          <AppText muted variant="label">
            {points}
          </AppText>
        ) : null}
      </View>

      {phase === 'solving' ? (
        <>
          <AppText muted style={styles.prompt}>
            {t('review.prompt')}
          </AppText>
          {run.totalMoves > 1 ? (
            <AppText muted variant="label" style={styles.prompt}>
              {t('review.progress', {
                index: run.moveNumber,
                total: run.totalMoves,
              })}
            </AppText>
          ) : null}
          <Button
            label={t('review.skip')}
            variant="secondary"
            onPress={queue.advance}
            style={styles.skip}
          />
        </>
      ) : (
        <Outcome
          mistake={current}
          attempt={attempt}
          phase={phase}
          replay={replay}
          replaySource={replaySource}
          onReplaySource={setReplaySource}
          detailsOpen={detailsOpen}
          onToggleDetails={() => setDetailsOpen((open) => !open)}
          onNext={queue.advance}
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

/**
 * Chrono affiché seul : le compte à la seconde tourne dans son propre état,
 * pour ne pas rerendre tout l'écran (échiquier SVG compris) chaque seconde.
 */
function ElapsedLabel({
  active,
  startedAt,
  frozenSeconds,
}: {
  active: boolean;
  startedAt: number;
  frozenSeconds: number;
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    if (!active) return;
    setSeconds(Math.floor((Date.now() - startedAt) / 1000));
    const timer = setInterval(
      () => setSeconds(Math.floor((Date.now() - startedAt) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [active, startedAt]);

  return (
    <AppText muted>
      {t('review.elapsed', { seconds: active ? seconds : frozenSeconds })}
    </AppText>
  );
}

function Outcome({
  mistake,
  attempt,
  phase,
  replay,
  replaySource,
  onReplaySource,
  detailsOpen,
  onToggleDetails,
  onNext,
}: {
  mistake: Mistake;
  attempt: Attempt | null;
  phase: Phase;
  replay: LineReplay;
  replaySource: ReplaySource;
  onReplaySource: (source: ReplaySource) => void;
  detailsOpen: boolean;
  onToggleDetails: () => void;
  onNext: () => void;
}) {
  const correct = phase === 'correct';
  const expected = bestMoveSan(mistake.accepted_moves);
  const hasSolution = (mistake.solution?.length ?? 0) > 0;
  const hasPunishment = mistake.punishment_pv.length > 0;

  return (
    <Panel style={styles.outcome}>
      <View style={styles.outcomeHeader}>
        <AppText
          variant="heading"
          color={correct ? Colors.success : Colors.danger}>
          {correct ? t('review.correct') : t('review.incorrect')}
        </AppText>
        <AppText muted variant="label">
          {t(`category.${mistake.category}` as TranslationKey)}
        </AppText>
      </View>

      {!correct ? (
        <>
          <LineFilter
            selected={replaySource}
            onSelect={onReplaySource}
            hasAttempt={Boolean(attempt?.move)}
            hasSolution={hasSolution}
            hasPunishment={hasPunishment}
          />
          <ReplayControls replay={replay} />
          {replay.branched ? (
            <View style={styles.lineActions}>
              <Button
                label={t('review.resetLine')}
                variant="secondary"
                onPress={replay.reset}
                style={styles.action}
              />
            </View>
          ) : null}
          <View style={styles.actions}>
            <Button label={t('review.next')} onPress={onNext} style={styles.action} />
          </View>
        </>
      ) : null}

      <Button
        label={detailsOpen ? t('review.hideDetails') : t('review.showDetails')}
        variant="secondary"
        onPress={onToggleDetails}
        style={styles.detailsToggle}
      />

      {detailsOpen ? (
        <>
          {attempt ? (
            <AppText muted style={styles.outcomeLine}>
              {t('review.grade', {
                grade: t(`grade.${attempt.gradeLabel}` as TranslationKey),
              })}
            </AppText>
          ) : null}
          {!correct ? (
            <>
              <AppText style={styles.outcomeLine}>
                {t('review.playedInGame', { move: mistake.move_played })}
              </AppText>
              {expected ? (
                <AppText style={styles.outcomeLine}>
                  {t('review.expected', { move: expected })}
                </AppText>
              ) : null}
            </>
          ) : null}
          <View style={styles.themes}>
            {mistake.themes.map((theme) => (
              <Chip key={theme} label={translateTheme(theme)} />
            ))}
          </View>
        </>
      ) : null}

      {correct ? (
        <View style={styles.actions}>
          <Button label={t('review.next')} onPress={onNext} style={styles.action} />
        </View>
      ) : null}
    </Panel>
  );
}

/** Quelle variante l'échiquier montre : mon coup, la solution, la réfutation. */
function LineFilter({
  selected,
  onSelect,
  hasAttempt,
  hasSolution,
  hasPunishment,
}: {
  selected: ReplaySource;
  onSelect: (source: ReplaySource) => void;
  hasAttempt: boolean;
  hasSolution: boolean;
  hasPunishment: boolean;
}) {
  return (
    <View style={styles.lines}>
      {hasAttempt ? (
        <Chip
          label={t('review.lineAttempt')}
          selected={selected === 'attempt'}
          onPress={() => onSelect('attempt')}
          style={styles.lineChip}
        />
      ) : null}
      {hasSolution ? (
        <Chip
          label={t('review.solutionTitle')}
          selected={selected === 'solution'}
          onPress={() => onSelect('solution')}
          style={styles.lineChip}
        />
      ) : null}
      {hasPunishment ? (
        <Chip
          label={t('review.punishmentTitle')}
          selected={selected === 'punishment'}
          onPress={() => onSelect('punishment')}
          style={styles.lineChip}
        />
      ) : null}
    </View>
  );
}


const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
    marginBottom: 5,
  },
  boardWrapper: {
    alignItems: 'center',
  },
  boardWaiting: {
    opacity: 0.55,
  },
  turn: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    marginTop: Spacing.md,
  },
  prompt: {
    marginTop: Spacing.xs,
  },
  skip: {
    alignSelf: 'flex-start',
    marginTop: Spacing.sm,
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
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
  outcomeHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
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
  themes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    rowGap: Spacing.xs,
  },
  lines: {
    flexDirection: 'row',
    flexWrap: 'nowrap',
    marginTop: Spacing.sm,
    columnGap: Spacing.sm,
  },
  lineChip: {
    flex: 1,
    marginRight: 0,
  },
  lineActions: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    columnGap: Spacing.sm,
  },
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    columnGap: Spacing.sm,
  },
  action: {
    flex: 1,
  },
});
