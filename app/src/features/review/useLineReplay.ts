import { Chess, type Square } from 'chess.js';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { LineMove } from '@/lib/types';

export interface Frame {
  fen: string;
  lastMove: { from: Square; to: Square } | null;
}

/** Cadence de la relecture d'une variante, en millisecondes. */
export const REPLAY_INTERVAL_MS = 900;

/**
 * Positions successives d'une variante.
 *
 * On avance en UCI (sans ambiguïté) avec repli sur le SAN. Un coup illégal
 * arrête la construction plutôt que de faire planter l'écran : mieux vaut une
 * variante tronquée qu'une carte inutilisable.
 */
export function buildFrames(startFen: string, moves: LineMove[]): Frame[] {
  const frames: Frame[] = [{ fen: startFen, lastMove: null }];
  let chess: Chess;
  try {
    chess = new Chess(startFen);
  } catch {
    return frames;
  }

  for (const move of moves) {
    try {
      const played = move.uci
        ? chess.move({
            from: move.uci.slice(0, 2),
            to: move.uci.slice(2, 4),
            promotion: move.uci.slice(4, 5) || undefined,
          })
        : chess.move(move.san);
      frames.push({
        fen: chess.fen(),
        lastMove: { from: played.from, to: played.to },
      });
    } catch {
      break;
    }
  }
  return frames;
}

export interface LineReplay {
  frame: Frame;
  step: number;
  total: number;
  atEnd: boolean;
  restart: () => void;
  next: () => void;
}

/** Relit une variante coup par coup, en avance automatique. */
export function useLineReplay(
  startFen: string,
  moves: LineMove[],
  active: boolean
): LineReplay {
  const frames = useMemo(() => buildFrames(startFen, moves), [startFen, moves]);
  const [step, setStep] = useState(0);

  useEffect(() => {
    setStep(0);
  }, [frames]);

  const atEnd = step >= frames.length - 1;

  useEffect(() => {
    if (!active || atEnd) return;
    const timer = setTimeout(
      () => setStep((previous) => previous + 1),
      REPLAY_INTERVAL_MS
    );
    return () => clearTimeout(timer);
  }, [active, atEnd, step]);

  const restart = useCallback(() => setStep(0), []);
  const next = useCallback(
    () => setStep((previous) => Math.min(previous + 1, frames.length - 1)),
    [frames.length]
  );

  return {
    frame: frames[Math.min(step, frames.length - 1)],
    step,
    total: frames.length - 1,
    atEnd,
    restart,
    next,
  };
}
