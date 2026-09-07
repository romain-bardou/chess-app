import { useCallback, useEffect, useMemo, useState } from 'react';

import type { BoardMove } from '@/chess/Chessboard';
import { playMove, type Position } from '@/chess/play';
import type { LineMove } from '@/lib/types';

export type Frame = Position;

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

  for (const move of moves) {
    const args: string | { from: string; to: string; promotion?: string } =
      move.uci
        ? {
            from: move.uci.slice(0, 2),
            to: move.uci.slice(2, 4),
            promotion: move.uci.slice(4, 5) || undefined,
          }
        : move.san;
    const next = playMove(frames[frames.length - 1].fen, args);
    if (!next) break;
    frames.push(next);
  }
  return frames;
}

/**
 * Variante prolongée à la main depuis le coup affiché.
 *
 * Tout ce qui suivait ce coup est abandonné : on est parti ailleurs, et deux
 * suites concurrentes dans la même liste n'auraient plus de sens. `null` si le
 * coup est illégal — l'échiquier reste alors sur place.
 */
export function exploreFrames(
  frames: Frame[],
  step: number,
  move: BoardMove
): Frame[] | null {
  const at = Math.min(Math.max(step, 0), frames.length - 1);
  const next = playMove(frames[at].fen, {
    from: move.from,
    to: move.to,
    promotion: move.promotion,
  });
  if (!next) return null;
  return [...frames.slice(0, at + 1), next];
}

export interface LineReplay {
  frame: Frame;
  step: number;
  total: number;
  atStart: boolean;
  atEnd: boolean;
  /** Vrai pendant le défilement automatique. */
  playing: boolean;
  /** Vrai dès qu'un coup joué à la main a remplacé la suite enregistrée. */
  branched: boolean;
  /** Lance le défilement ; repart du début s'il est déjà au bout. */
  play: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  /** Joue un coup depuis la position affichée et s'y arrête. */
  explore: (move: BoardMove) => void;
  /** Abandonne les coups joués à la main et rend la variante enregistrée. */
  reset: () => void;
}

export interface LineReplayOptions {
  /** Position de départ de la variante. */
  fen: string;
  moves: LineMove[];
  active: boolean;
  autoPlay?: boolean;
  /**
   * Coup affiché d'emblée. 1 pour montrer tout de suite le premier coup de la
   * variante — le coup qu'on vient de jouer, qu'on veut voir se poser.
   */
  initialStep?: number;
}

/**
 * Relit une variante coup par coup, et la prolonge où l'on veut.
 *
 * La suite enregistrée ne se déroule pas d'elle-même : dérouler tout seul
 * retire l'occasion de chercher où était l'erreur. `autoPlay` rétablit le
 * déroulé immédiat pour qui le préfère, et les flèches interrompent le
 * défilement plutôt que de lutter contre lui.
 *
 * Depuis n'importe quel coup, jouer sur l'échiquier remplace la suite par la
 * sienne : c'est le seul moyen de répondre à « et si j'avais joué ça ? » sans
 * moteur embarqué. `reset` rend la variante d'origine.
 */
export function useLineReplay({
  fen,
  moves,
  active,
  autoPlay = false,
  initialStep = 0,
}: LineReplayOptions): LineReplay {
  const base = useMemo(() => buildFrames(fen, moves), [fen, moves]);
  const [frames, setFrames] = useState(base);
  const [step, setStep] = useState(initialStep);
  const [playing, setPlaying] = useState(false);

  const shouldStart = active && autoPlay;
  useEffect(() => {
    setFrames(base);
    setStep(Math.min(Math.max(initialStep, 0), base.length - 1));
    setPlaying(shouldStart);
  }, [base, shouldStart, initialStep]);

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

  const explore = useCallback(
    (move: BoardMove) => {
      const branch = exploreFrames(frames, step, move);
      if (!branch) return;
      setPlaying(false);
      setFrames(branch);
      setStep(branch.length - 1);
    },
    [frames, step]
  );

  const reset = useCallback(() => {
    setPlaying(false);
    setFrames(base);
    setStep((current) => Math.min(current, base.length - 1));
  }, [base]);

  return {
    frame: frames[Math.min(step, last)],
    step,
    total: last,
    atStart: step <= 0,
    atEnd,
    playing,
    branched: frames !== base,
    play,
    pause,
    next,
    previous,
    explore,
    reset,
  };
}
