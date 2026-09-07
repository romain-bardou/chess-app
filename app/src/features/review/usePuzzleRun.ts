/**
 * Déroulé d'un puzzle à plusieurs coups.
 *
 * Une carte ne s'arrête plus au premier coup : la solution va jusqu'au gain
 * (matériel ou mat). Le joueur joue les demi-coups pairs, l'adversaire répond
 * tout seul sur les impairs, jusqu'à épuisement de la ligne.
 *
 * La carte s'ouvre sur la position d'avant le dernier coup adverse, qui se joue
 * alors sous les yeux du joueur : c'est ce coup qui a créé la faiblesse, le
 * voir arriver vaut mieux que le déduire d'un surlignage. Les cartes qui n'ont
 * pas cette position en base se posent directement sur la position à résoudre.
 *
 * Les cartes créées avant la migration 005 n'ont pas de `solution` : elles se
 * comportent comme avant, un coup et c'est fini.
 */
import { type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { BoardMove } from '@/chess/Chessboard';
import { playMove, uciSquares, type MoveInput } from '@/chess/play';
import { isAcceptedMove, matchesLineMove } from '@/features/review/grading';
import type { LineMove, Mistake } from '@/lib/types';

/** Temps de latence avant la réponse adverse, pour qu'on la voie arriver. */
export const REPLY_DELAY_MS = 450;

/** Temps d'affichage de la position avant le dernier coup adverse. */
export const INTRO_DELAY_MS = 550;

export type PuzzleVerdict = 'wrong' | 'progress' | 'solved';

export interface PuzzleRun {
  fen: string;
  lastMove: { from: Square; to: Square } | null;
  /** Numéro du coup attendu (1-indexé), pour l'afficher au joueur. */
  moveNumber: number;
  /** Nombre total de coups à trouver. */
  totalMoves: number;
  /** Vrai pendant la réponse adverse : l'échiquier doit rester bloqué. */
  waiting: boolean;
  /** Faux tant que le coup adverse d'ouverture n'est pas posé : le chrono attend. */
  ready: boolean;
  /** Joue le coup du solveur et dit où en est le puzzle. */
  play: (move: BoardMove) => PuzzleVerdict;
}

/** Position après un coup, ou la position d'origine si le coup est illégal. */
function push(
  fen: string,
  move: MoveInput
): { fen: string; lastMove: { from: Square; to: Square } | null } {
  return playMove(fen, move) ?? { fen, lastMove: null };
}

/**
 * Deux FEN désignent-elles la même position ? Les compteurs de coups sont
 * ignorés : ils ne changent rien à ce qu'on voit sur l'échiquier.
 */
function samePosition(left: string, right: string): boolean {
  return (
    left.split(' ').slice(0, 4).join(' ') ===
    right.split(' ').slice(0, 4).join(' ')
  );
}

function toMoveArgs(line: LineMove) {
  return line.uci
    ? {
        from: line.uci.slice(0, 2),
        to: line.uci.slice(2, 4),
        promotion: line.uci.slice(4, 5) || undefined,
      }
    : line.san;
}

export function usePuzzleRun(mistake: Mistake | null): PuzzleRun {
  const solution = useMemo(() => mistake?.solution ?? [], [mistake]);
  const startFen = mistake?.fen ?? '';
  const previous = mistake?.previous_move ?? null;
  // Position d'avant le coup adverse, si la carte la porte et qu'elle mène
  // bien là où la carte commence.
  const introFen = previous?.fen ?? null;

  const [fen, setFen] = useState(startFen);
  const [lastMove, setLastMove] = useState<{ from: Square; to: Square } | null>(
    null
  );
  // Demi-coups de la solution déjà consommés ; toujours pair hors animation.
  const [index, setIndex] = useState(0);
  const [waiting, setWaiting] = useState(false);
  const [ready, setReady] = useState(false);
  const indexRef = useRef(0);
  const reply = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearReply = useCallback(() => {
    if (reply.current) clearTimeout(reply.current);
    reply.current = null;
  }, []);

  /**
   * Le coup adverse joué depuis cette position, s'il mène bien à la position
   * de la carte. Une donnée incohérente ferait résoudre une autre position que
   * celle qui a été analysée : dans le doute, pas d'ouverture animée.
   */
  const opening = useMemo(() => {
    if (!introFen || !previous) return null;
    const played = playMove(introFen, toMoveArgs(previous));
    if (!played || !samePosition(played.fen, startFen)) return null;
    return { from: introFen, ...played };
  }, [introFen, previous, startFen]);

  useEffect(() => {
    clearReply();
    indexRef.current = 0;
    setIndex(0);
    setWaiting(false);

    // Sans ouverture exploitable, la carte se pose sur la position à résoudre,
    // le dernier coup adverse simplement surligné.
    if (!opening) {
      setFen(startFen);
      setLastMove(uciSquares(previous?.uci));
      setReady(true);
      return clearReply;
    }

    setFen(opening.from);
    setLastMove(null);
    setReady(false);
    setWaiting(true);
    reply.current = setTimeout(() => {
      setFen(opening.fen);
      setLastMove(opening.lastMove);
      setWaiting(false);
      setReady(true);
    }, INTRO_DELAY_MS);

    return clearReply;
    // L'identifiant fait partie des dépendances : deux cartes peuvent
    // partager une position sans être la même carte.
  }, [mistake?.id, startFen, opening, previous?.uci, clearReply]);

  const play = useCallback(
    (move: BoardMove): PuzzleVerdict => {
      if (!mistake) return 'wrong';
      const at = indexRef.current;
      const expected = solution[at];

      // Le premier coup accepte toute continuation non sanctionnée ; les
      // suivants suivent la ligne, seul endroit où l'on connaît la suite.
      const correct =
        at === 0
          ? isAcceptedMove(move, mistake.accepted_moves)
          : Boolean(expected) && matchesLineMove(move, expected);
      if (!correct) return 'wrong';

      const after = push(fen, {
        from: move.from,
        to: move.to,
        promotion: move.promotion,
      });
      setFen(after.fen);
      setLastMove(after.lastMove);

      // On ne peut poursuivre que sur la ligne enregistrée : un autre coup
      // accepté, tout aussi correct, sort du répertoire connu.
      const continues =
        Boolean(expected) &&
        matchesLineMove(move, expected) &&
        at + 1 < solution.length;
      if (!continues) return 'solved';

      clearReply();
      setWaiting(true);
      reply.current = setTimeout(() => {
        const answered = push(after.fen, toMoveArgs(solution[at + 1]));
        setFen(answered.fen);
        setLastMove(answered.lastMove);
        indexRef.current = at + 2;
        setIndex(at + 2);
        setWaiting(false);
      }, REPLY_DELAY_MS);

      return 'progress';
    },
    [clearReply, fen, mistake, solution]
  );

  return {
    fen: fen || startFen,
    lastMove,
    moveNumber: Math.floor(index / 2) + 1,
    waiting,
    ready,
    totalMoves: Math.max(1, Math.ceil(solution.length / 2)),
    play,
  };
}
