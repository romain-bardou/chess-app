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
  atStart: boolean;
  atEnd: boolean;
  /** Vrai pendant le défilement automatique. */
  playing: boolean;
  /** Lance le défilement ; repart du début s'il est déjà au bout. */
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
}

/**
 * Relit une variante coup par coup.
 *
 * La position de départ reste à l'écran tant que le joueur ne demande rien :
 * dérouler la suite tout seul lui retire l'occasion de chercher où était son
 * erreur. `autoPlay` rétablit le déroulé immédiat pour qui le préfère.
 *
 * Les flèches interrompent le défilement plutôt que de lutter contre lui.
 */
export function useLineReplay(
  startFen: string,
  moves: LineMove[],
  active: boolean,
  autoPlay = false
): LineReplay {
  const frames = useMemo(() => buildFrames(startFen, moves), [startFen, moves]);
  const [step, setStep] = useState(0);
  const [playing, setPlaying] = useState(false);

  const shouldStart = active && autoPlay;
  useEffect(() => {
    setStep(0);
    setPlaying(shouldStart);
  }, [frames, shouldStart]);

  const last = frames.length - 1;
  const atEnd = step >= last;

  useEffect(() => {
    if (!active || !playing) return;
    if (atEnd) {
      setPlaying(false);
      return;
    }
    const timer = setTimeout(
      () => setStep((previous) => previous + 1),
      REPLAY_INTERVAL_MS
    );
    return () => clearTimeout(timer);
  }, [active, playing, atEnd, step]);

  const play = useCallback(() => {
    setStep((current) => (current >= last ? 0 : current));
    setPlaying(true);
  }, [last]);

  const pause = useCallback(() => setPlaying(false), []);

  const next = useCallback(() => {
    setPlaying(false);
    setStep((previous) => Math.min(previous + 1, last));
  }, [last]);

  const previous = useCallback(() => {
    setPlaying(false);
    setStep((current) => Math.max(current - 1, 0));
  }, []);

  return {
    frame: frames[Math.min(step, last)],
    step,
    total: last,
    atStart: step <= 0,
    atEnd,
    playing,
    play,
    pause,
    next,
    previous,
  };
}
