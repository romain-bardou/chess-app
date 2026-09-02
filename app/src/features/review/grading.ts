/** Comparaison du coup joué aux coups acceptés. */
import type { PieceSymbol, Square } from 'chess.js';

import type { AcceptedMove } from '@/lib/types';

export interface AttemptedMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  san: string;
}

export function toUci(move: AttemptedMove): string {
  return `${move.from}${move.to}${move.promotion ?? ''}`;
}

/**
 * Un coup est réussi s'il figure parmi les coups acceptés — pas seulement s'il
 * est le premier choix du moteur.
 *
 * La comparaison se fait sur l'UCI, seule notation sans ambiguïté ; le SAN
 * sert de repli au cas où le script d'analyse aurait produit un UCI vide.
 */
export function isAcceptedMove(
  move: AttemptedMove,
  accepted: AcceptedMove[]
): boolean {
  const uci = toUci(move);
  return accepted.some(
    (candidate) =>
      (candidate.uci && candidate.uci === uci) ||
      (!candidate.uci && candidate.san === move.san)
  );
}

/** Le coup attendu à afficher après un échec : le premier choix du moteur. */
export function bestMoveSan(accepted: AcceptedMove[]): string | null {
  return accepted[0]?.san ?? null;
}
