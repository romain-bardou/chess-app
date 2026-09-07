/**
 * Jouer un coup sur une FEN, sans état ni composant.
 *
 * Deux appelants s'en servent — le déroulé d'un puzzle et la relecture d'une
 * variante — et tous deux veulent la même chose : la position d'arrivée et les
 * cases traversées, ou rien du tout si le coup est illégal.
 */
import { Chess, type Square } from 'chess.js';

export interface Position {
  fen: string;
  lastMove: { from: Square; to: Square } | null;
}

/** Un coup, en SAN ou par ses cases. */
export type MoveInput = string | { from: string; to: string; promotion?: string };

/** Cases d'un coup en UCI, pour surligner d'où à où il est allé. */
export function uciSquares(
  uci: string | undefined
): { from: Square; to: Square } | null {
  if (!uci || uci.length < 4) return null;
  return { from: uci.slice(0, 2) as Square, to: uci.slice(2, 4) as Square };
}

/** Position après le coup, ou `null` s'il est illégal. */
export function playMove(fen: string, move: MoveInput): Position | null {
  try {
    const chess = new Chess(fen);
    const played = chess.move(move as never);
    return { fen: chess.fen(), lastMove: { from: played.from, to: played.to } };
  } catch {
    return null;
  }
}
