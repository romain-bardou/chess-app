import { Chess, type Square } from 'chess.js';
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
} from '@/components/ui';
import { fetchThemeStats, saveReview } from '@/features/review/api';
import { bestMoveSan, isAcceptedMove } from '@/features/review/grading';
import { useLineReplay } from '@/features/review/useLineReplay';
import { useReviewQueue } from '@/features/review/useReviewQueue';
import { GRADE_LABELS, reviewMistake } from '@/lib/fsrs';
import { t, translateTheme, type TranslationKey } from '@/lib/i18n';
import type { LineMove, Mistake } from '@/lib/types';
import { Colors, Spacing } from '@/theme/atelier';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const MAX_BOARD_SIZE = 440;

type Phase = 'solving' | 'correct' | 'wrong';

interface Attempt {
  correct: boolean;
  gradeLabel: string;
  playedSan: string;
  fenAfter: string;
  lastMove: { from: Square; to: Square };
}

/** Position résultant d'un coup, pour figer l'échiquier après une réussite. */
function applyMove(fen: string, move: BoardMove) {
  const chess = new Chess(fen);
  chess.move({ from: move.from, to: move.to, promotion: move.promotion });
  return chess.fen();
}

export function ReviewScreen({ initialTheme = null }: { initialTheme?: string | null }) {
  const [theme, setTheme] = useState<string | null>(initialTheme);
  const [availableThemes, setAvailableThemes] = useState<string[]>([]);
  const queue = useReviewQueue(theme);
  const current = queue.current;

  const [phase, setPhase] = useState<Phase>('solving');
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
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
  useEffect(() => {
    setPhase('solving');
    setAttempt(null);
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
    // La réfutation part de ma position : on rejoue d'abord mon coup.
    return [{ san: current.move_played, uci: '' }, ...current.punishment_pv];
  }, [current]);

  const replay = useLineReplay(
    current?.fen ?? START_FEN,
    replayMoves,
    phase === 'wrong'
  );

  const handleMove = useCallback(
    (move: BoardMove) => {
      if (!current || phase !== 'solving') return;

      const seconds = (Date.now() - startedAt.current) / 1000;
      const correct = isAcceptedMove(move, current.accepted_moves);
      const outcome = reviewMistake(current, correct, seconds);

      setAttempt({
        correct,
        gradeLabel: GRADE_LABELS[outcome.grade],
        playedSan: move.san,
        fenAfter: correct ? applyMove(current.fen, move) : current.fen,
        lastMove: { from: move.from, to: move.to },
      });
      setElapsed(Math.floor(seconds));
      setPhase(correct ? 'correct' : 'wrong');

      saveReview(current.id, outcome.update).catch((cause: unknown) =>
        setSaveError(cause instanceof Error ? cause.message : String(cause))
      );
    },
    [current, phase]
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
  const board =
    phase === 'wrong'
      ? { fen: replay.frame.fen, lastMove: replay.frame.lastMove }
      : phase === 'correct' && attempt
        ? { fen: attempt.fenAfter, lastMove: attempt.lastMove }
        : { fen: current.fen, lastMove: null };

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
          interactive={phase === 'solving'}
          lastMove={board.lastMove}
          onMove={handleMove}
        />
      </View>

      <AppText variant="heading" style={styles.turn}>
        {solverColor === 'w' ? t('review.whiteToPlay') : t('review.blackToPlay')}
      </AppText>

      {phase === 'solving' ? (
        <AppText muted style={styles.prompt}>
          {t('review.prompt')}
        </AppText>
      ) : (
        <Outcome
          mistake={current}
          attempt={attempt}
          phase={phase}
          onReplay={replay.restart}
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
  onReplay,
  onNext,
}: {
  mistake: Mistake;
  attempt: Attempt | null;
  phase: Phase;
  onReplay: () => void;
  onNext: () => void;
}) {
  const correct = phase === 'correct';
  const expected = bestMoveSan(mistake.accepted_moves);

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
            {mistake.punishment_pv.length > 0
              ? t('review.punishmentTitle')
              : t('review.punishmentEmpty')}
          </AppText>
        </>
      ) : null}

      <View style={styles.themes}>
        {mistake.themes.map((theme) => (
          <Chip key={theme} label={translateTheme(theme)} />
        ))}
      </View>

      <View style={styles.actions}>
        {!correct && mistake.punishment_pv.length > 0 ? (
          <Button
            label={t('review.replay')}
            variant="secondary"
            onPress={onReplay}
            style={styles.action}
          />
        ) : null}
        <Button label={t('review.next')} onPress={onNext} style={styles.action} />
      </View>
    </Panel>
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
  actions: {
    flexDirection: 'row',
    marginTop: Spacing.md,
    columnGap: Spacing.sm,
  },
  action: {
    flex: 1,
  },
});
