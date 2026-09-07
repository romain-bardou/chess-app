import type { Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';

import { Chessboard, type BoardMove } from '@/chess/Chessboard';
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
import { AUTO_PLAY_LINE, useStoredFlag } from '@/lib/settings';
import type { LineMove, Mistake, SolutionGain } from '@/lib/types';
import { Colors, Spacing } from '@/theme/atelier';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_BOARD_SIZE = 440;

type Phase = 'solving' | 'correct' | 'wrong';

/** Ligne rejouée après un échec : la punition du coup de partie, ou la solution. */
type ReplaySource = 'punishment' | 'solution';

interface Attempt {
  correct: boolean;
  gradeLabel: string;
  playedSan: string;
}

/** Cases d'un coup en UCI, pour surligner le dernier coup adverse. */
function uciSquares(uci: string | undefined): { from: Square; to: Square } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
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
  const queue = useReviewQueue(theme);
  const current = queue.current;

  const [phase, setPhase] = useState<Phase>('solving');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [replaySource, setReplaySource] = useState<ReplaySource>('punishment');
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  // Après une erreur, la variante attend le joueur ; ce réglage la déroule
  // tout de suite pour qui préfère voir la suite sans rien demander.
  const [autoPlayLine, setAutoPlayLine] = useStoredFlag(AUTO_PLAY_LINE, false);
  const startedAt = useRef(Date.now());

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
    setSaveError(null);
    setElapsed(0);
    startedAt.current = Date.now();
  }, [current?.id]);

  useEffect(() => {
    if (phase !== 'solving' || !current) return;
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
      1000
    );
    return () => clearInterval(timer);
  }, [phase, current]);

  const replayMoves = useMemo<LineMove[]>(() => {
    if (!current) return [];
    if (replaySource === 'solution') return current.solution ?? [];
    // La réfutation part de ma position : on rejoue d'abord mon coup.
    return [{ san: current.move_played, uci: '' }, ...current.punishment_pv];
  }, [current, replaySource]);

  const replay = useLineReplay(
    current?.fen ?? START_FEN,
    replayMoves,
    phase === 'wrong',
    autoPlayLine
  );

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
      });
      // Un échec en cours de ligne n'a rien à voir avec la réfutation du coup
      // de partie : c'est la solution qu'il faut revoir.
      setReplaySource(
        !correct && run.moveNumber > 1 ? 'solution' : 'punishment'
      );
      setElapsed(Math.floor(seconds));
      setPhase(correct ? 'correct' : 'wrong');

      saveReview(current.id, outcome.update).catch((cause: unknown) =>
        setSaveError(cause instanceof Error ? cause.message : String(cause))
      );
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
      : { fen: run.fen, lastMove: run.lastMove ?? previousSquares };

  return (
    <Screen scroll>
      <View style={styles.header}>
        <AppText variant="title">{t('review.title')}</AppText>
        <AppText muted>{t('review.elapsed', { seconds: elapsed })}</AppText>
      </View>

      <ThemeFilter themes={availableThemes} selected={theme} onSelect={setTheme} />

      <AppText muted style={styles.remaining}>
        {t('review.remaining', { count: queue.remaining })}
      </AppText>

      <View style={styles.boardWrapper}>
        <Chessboard
          fen={board.fen}
          orientation={solverColor}
          size={boardSize}
          interactive={phase === 'solving' && !run.waiting}
          lastMove={board.lastMove}
          onMove={handleMove}
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
        </>
      ) : (
        <Outcome
          mistake={current}
          attempt={attempt}
          phase={phase}
          replay={replay}
          replaySource={replaySource}
          onReplaySource={setReplaySource}
          autoPlayLine={autoPlayLine}
          onAutoPlayLine={setAutoPlayLine}
          onNext={queue.advance}
        />
      )}

      {saveError ? (
        <AppText color={Colors.danger} style={styles.prompt}>
          {saveError}
        </AppText>
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

function Outcome({
  mistake,
  attempt,
  phase,
  replay,
  replaySource,
  onReplaySource,
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
          <AppText muted variant="label" style={styles.outcomeLine}>
            {replaySource === 'solution'
              ? t('review.solutionTitle')
              : hasPunishment
                ? t('review.punishmentTitle')
                : t('review.punishmentEmpty')}
          </AppText>
          <ReplayControls replay={replay} />
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
              style={styles.playLine}
            />
          ) : null}
          <Toggle
            label={t('review.autoPlayLine')}
            value={autoPlayLine}
            onValueChange={onAutoPlayLine}
          />
        </>
      ) : null}

      <View style={styles.themes}>
        {mistake.themes.map((theme) => (
          <Chip key={theme} label={translateTheme(theme)} />
        ))}
      </View>

      <View style={styles.actions}>
        {!correct && hasSolution && replaySource === 'punishment' ? (
          <Button
            label={t('review.showSolution')}
            variant="secondary"
            onPress={() => onReplaySource('solution')}
            style={styles.action}
          />
        ) : null}
        {!correct && hasPunishment && replaySource === 'solution' ? (
          <Button
            label={t('review.showPunishment')}
            variant="secondary"
            onPress={() => onReplaySource('punishment')}
            style={styles.action}
          />
        ) : null}
        <Button label={t('review.next')} onPress={onNext} style={styles.action} />
      </View>
    </Panel>
  );
}

/** Flèches de défilement de la variante affichée, coup par coup. */
function ReplayControls({ replay }: { replay: LineReplay }) {
  if (replay.total <= 0) return null;
  return (
    <View style={styles.replayControls}>
      <Button
        label="◀"
        variant="secondary"
        accessibilityLabel={t('review.stepBack')}
        disabled={replay.atStart}
        onPress={replay.previous}
      />
      <AppText muted variant="label">
        {t('review.step', { step: replay.step, total: replay.total })}
      </AppText>
      <Button
        label="▶"
        variant="secondary"
        accessibilityLabel={t('review.stepForward')}
        disabled={replay.atEnd}
        onPress={replay.next}
      />
    </View>
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
  remaining: {
    marginTop: Spacing.xs,
    marginBottom: Spacing.sm,
  },
  boardWrapper: {
    alignItems: 'center',
  },
  turn: {
    marginTop: Spacing.md,
  },
  prompt: {
    marginTop: Spacing.xs,
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
  themes: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: Spacing.sm,
    rowGap: Spacing.xs,
  },
  playLine: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  replayControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    marginTop: Spacing.sm,
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
