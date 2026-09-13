import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';

import { Chessboard, type BoardMove } from '@/chess/Chessboard';
import { uciSquares } from '@/chess/play';
import {
  AppText,
  Button,
  Chip,
  EmptyState,
  Loader,
  Panel,
  Screen,
  Toggle,
} from '@/components/ui';
import { fetchThemeStats, saveReview } from '@/features/review/api';
import { bestMoveSan } from '@/features/review/grading';
import { useLineReplay, type LineReplay } from '@/features/review/useLineReplay';
import { usePuzzleRun } from '@/features/review/usePuzzleRun';
import { useReviewQueue } from '@/features/review/useReviewQueue';
import { GRADE_LABELS, reviewMistake } from '@/lib/fsrs';
import { t, translateTheme, type TranslationKey } from '@/lib/i18n';
import { AUTO_PLAY_LINE, SHUFFLE_QUEUE, useStoredFlag } from '@/lib/settings';
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

/** Ce que rapporte la solution, en une ligne. */
function gainLabel(gain: SolutionGain | null): string | null {
  if (!gain) return null;
  if (gain.type === 'mate') return t('review.gainMate');
  return t('review.gainMaterial', { value: gain.value });
}

export function ReviewScreen({ initialTheme = null }: { initialTheme?: string | null }) {
  const [theme, setTheme] = useState<string | null>(initialTheme);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  // Les cartes neuves arrivent groupées par partie, dans l'ordre des coups :
  // pratique pour revoir une partie, trop indicatif pour tester la mémoire.
  const [shuffle, setShuffle] = useStoredFlag(SHUFFLE_QUEUE, false);
  const queue = useReviewQueue(theme, shuffle);
  const current = queue.current;

  const [phase, setPhase] = useState<Phase>('solving');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [replaySource, setReplaySource] = useState<ReplaySource>('punishment');
  // L'issue (verdict + coups) s'affiche seule ; la variante explorable ne
  // s'ouvre qu'à la demande, pour ne pas noyer le verdict sous les contrôles.
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Après une erreur, la variante attend le joueur ; ce réglage la déroule
  // tout de suite pour qui préfère voir la suite sans rien demander.
  const [autoPlayLine, setAutoPlayLine] = useStoredFlag(AUTO_PLAY_LINE, false);
  const startedAt = useRef(Date.now());
  /** Rejoue le dernier enregistrement raté ; posé à chaque tentative. */
  const retrySaveRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    setTheme(initialTheme);
  }, [initialTheme]);

  useEffect(() => {
    fetchThemeStats()
      .then((rows) =>
        setAvailableThemes(
          rows.filter((row) => row.due > 0).map((row) => row.theme)
        )
      )
      // Le filtre est un confort : son échec ne doit pas bloquer la révision.
      .catch(() => setAvailableThemes([]));
  }, []);

  // Le chrono démarre à l'affichage de la position, pas au premier contact.
  const run = usePuzzleRun(current);

  useEffect(() => {
    setPhase('solving');
    setAttempt(null);
    setReplaySource('punishment');
    setDetailsOpen(false);
    setSaveError(null);
    setElapsed(0);
  }, [current?.id]);

  // Le chrono part quand la position à résoudre est posée, pas pendant que le
  // dernier coup adverse se joue : cette seconde-là n'est pas de la réflexion.
  useEffect(() => {
    if (!run.ready) return;
    setElapsed(0);
    startedAt.current = Date.now();
  }, [run.ready, current?.id]);

  useEffect(() => {
    if (phase !== 'solving' || !current || !run.ready) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [phase, current, run.ready]);

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
      const seconds = (Date.now() - startedAt.current) / 1000;
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
      setElapsed(Math.floor(seconds));
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
    [current, phase, run]
  );

  const { width } = useWindowDimensions();
  const boardSize = Math.min(width - Spacing.md * 2, MAX_BOARD_SIZE);

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
        <ThemeFilter
          themes={availableThemes}
          selected={theme}
          onSelect={setTheme}
        />
        <EmptyState
          title={t('review.emptyTitle')}
          body={theme ? t('review.emptyThemeBody') : t('review.emptyBody')}
          action={<Button label={t('common.retry')} onPress={queue.reload} />}
        />
      </Screen>
    );
  }

  const solverColor = current.fen.split(' ')[1] === 'w' ? 'w' : 'b';
  // Le dernier coup adverse situe la position : sans lui, on cherche ce qui
  // vient de changer avant de chercher le bon coup.
  const previousSquares = uciSquares(current.previous_move?.uci);
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
        <AppText variant="title">{t('review.title')}</AppText>
        <AppText muted>{t('review.elapsed', { seconds: elapsed })}</AppText>
      </View>

      <ThemeFilter themes={availableThemes} selected={theme} onSelect={setTheme} />

      <OrderFilter shuffle={shuffle} onSelect={setShuffle} />

      <AppText muted style={styles.remaining}>
        {t('review.remaining', { count: queue.remaining })}
      </AppText>

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

      <AppText variant="heading" style={styles.turn}>
        {solverColor === 'w' ? t('review.whiteToPlay') : t('review.blackToPlay')}
      </AppText>

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
          autoPlayLine={autoPlayLine}
          onAutoPlayLine={setAutoPlayLine}
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

function ThemeFilter({
  themes,
  selected,
  onSelect,
}: {
  themes: string[];
  selected: string | null;
  onSelect: (theme: string | null) => void;
}) {
  if (themes.length === 0) return null;
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.filter}
      contentContainerStyle={styles.filterContent}>
      <Chip
        label={t('common.all')}
        selected={selected === null}
        onPress={() => onSelect(null)}
      />
      {themes.map((theme) => (
        <Chip
          key={theme}
          label={translateTheme(theme)}
          selected={selected === theme}
          onPress={() => onSelect(theme)}
        />
      ))}
    </ScrollView>
  );
}

/** Ordre de la file : les cartes d'une partie à la suite, ou battues. */
function OrderFilter({
  shuffle,
  onSelect,
}: {
  shuffle: boolean;
  onSelect: (shuffle: boolean) => void;
}) {
  return (
    <View style={styles.order}>
      <Chip
        label={t('review.orderByGame')}
        selected={!shuffle}
        onPress={() => onSelect(false)}
      />
      <Chip
        label={t('review.orderRandom')}
        selected={shuffle}
        onPress={() => onSelect(true)}
      />
    </View>
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
  autoPlayLine,
  onAutoPlayLine,
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
  autoPlayLine: boolean;
  onAutoPlayLine: (value: boolean) => void;
  onNext: () => void;
}) {
  const correct = phase === 'correct';
  const expected = bestMoveSan(mistake.accepted_moves);
  const gain = gainLabel(mistake.solution_gain);
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

      {attempt ? (
        <AppText muted style={styles.outcomeLine}>
          {t('review.grade', {
            grade: t(`grade.${attempt.gradeLabel}` as TranslationKey),
          })}
        </AppText>
      ) : null}

      {gain ? (
        <AppText muted style={styles.outcomeLine}>
          {gain}
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

          <Button
            label={detailsOpen ? t('review.hideDetails') : t('review.showDetails')}
            variant="secondary"
            onPress={onToggleDetails}
            style={styles.detailsToggle}
          />

          {detailsOpen ? (
            <>
              <LineFilter
                selected={replaySource}
                onSelect={onReplaySource}
                hasAttempt={Boolean(attempt?.move)}
                hasSolution={hasSolution}
                hasPunishment={hasPunishment}
              />
              <AppText muted variant="label" style={styles.outcomeLine}>
                {t('review.exploreHint')}
              </AppText>
              <ReplayControls replay={replay} />
              <View style={styles.lineActions}>
                {replay.total > 0 ? (
                  <Button
                    // La variante ne se déroule pas d'elle-même : on regarde la
                    // position ratée aussi longtemps qu'on veut avant de la voir.
                    label={
                      replay.playing
                        ? t('review.pauseLine')
                        : replay.atEnd
                          ? t('review.replay')
                          : t('review.playLine')
                    }
                    variant="secondary"
                    onPress={replay.playing ? replay.pause : replay.play}
                    style={styles.action}
                  />
                ) : null}
                {replay.branched ? (
                  <Button
                    label={t('review.resetLine')}
                    variant="secondary"
                    onPress={replay.reset}
                    style={styles.action}
                  />
                ) : null}
              </View>
              <Toggle
                label={t('review.autoPlayLine')}
                value={autoPlayLine}
                onValueChange={onAutoPlayLine}
              />
            </>
          ) : null}
        </>
      ) : null}

      <View style={styles.themes}>
        {mistake.themes.map((theme) => (
          <Chip key={theme} label={translateTheme(theme)} />
        ))}
      </View>

      <View style={styles.actions}>
        <Button label={t('review.next')} onPress={onNext} style={styles.action} />
      </View>
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
        />
      ) : null}
      {hasSolution ? (
        <Chip
          label={t('review.solutionTitle')}
          selected={selected === 'solution'}
          onPress={() => onSelect('solution')}
        />
      ) : null}
      {hasPunishment ? (
        <Chip
          label={t('review.punishmentTitle')}
          selected={selected === 'punishment'}
          onPress={() => onSelect('punishment')}
        />
      ) : null}
    </View>
  );
}

/** Flèches de défilement de la variante affichée, coup par coup. */
function ReplayControls({ replay }: { replay: LineReplay }) {
  if (replay.total <= 0) return null;
  return (
    <View style={styles.replayControls}>
      <StepButton
        direction="back"
        accessibilityLabel={t('review.stepBack')}
        disabled={replay.atStart}
        onPress={replay.previous}
      />
      <AppText muted variant="label">
        {t('review.step', { step: replay.step, total: replay.total })}
      </AppText>
      <StepButton
        direction="forward"
        accessibilityLabel={t('review.stepForward')}
        disabled={replay.atEnd}
        onPress={replay.next}
      />
    </View>
  );
}

/** Chevron dessiné en trait, plutôt qu'un glyphe Unicode ◀ / ▶. */
function StepButton({
  direction,
  disabled = false,
  accessibilityLabel,
  onPress,
}: {
  direction: 'back' | 'forward';
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const d = direction === 'back' ? 'M12 5L7 11L12 17' : 'M8 5L13 11L8 17';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        (pressed || disabled) && styles.stepButtonDimmed,
      ]}>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Path
          d={d}
          stroke={Colors.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingTop: Spacing.sm,
  },
  filter: {
    marginTop: Spacing.sm,
    flexGrow: 0,
  },
  filterContent: {
    paddingVertical: Spacing.xs,
  },
  order: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
  },
  remaining: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  boardWrapper: {
    alignItems: 'center',
  },
  boardWaiting: {
    opacity: 0.55,
  },
  turn: {
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
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    rowGap: Spacing.xs,
  },
  lineActions: {
    flexDirection: 'row',
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
    columnGap: Spacing.sm,
  },
  replayControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: Spacing.sm,
    columnGap: Spacing.sm,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDimmed: {
    opacity: 0.6,
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
