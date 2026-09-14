/**
 * Déplacements de pièces entre deux positions.
 *
 * L'échiquier est contrôlé : il reçoit une nouvelle FEN sans savoir quel coup
 * l'a produite (coup du joueur, réponse adverse, défilement d'une variante).
 * Pour animer le trajet il faut donc le retrouver, en comparant les deux
 * plateaux plutôt qu'en faisant confiance à l'appelant.
 *
 * Le roque produit deux trajets, la prise en passant en produit un (le pion
 * capturé disparaît sur place), la promotion aussi (la pièce d'arrivée n'a pas
 * le type de celle du départ).
 */
import type { Color, PieceSymbol, Square } from 'chess.js';

import { FILES } from '@/chess/squares';

export interface PieceTravel {
  from: Square;
  to: Square;
  type: PieceSymbol;
  color: Color;
}

/** Un coup déplace au plus deux pièces : le roi et sa tour. Au-delà, la
 * position a changé pour une autre raison (nouvelle carte, retour arrière). */
const MAX_TRAVELS = 2;

interface Placed {
  square: Square;
  type: PieceSymbol;
  color: Color;
}

/** Pièces d'une FEN, indexées par case. `null` si le champ est illisible. */
function readPlacement(fen: string): Map<Square, Placed> | null {
  const placement = fen.split(' ')[0];
  if (!placement) return null;

  const rows = placement.split('/');
  if (rows.length !== 8) return null;

  const board = new Map<Square, Placed>();
  for (let row = 0; row < 8; row += 1) {
    let file = 0;
    for (const character of rows[row]) {
      if (character >= '1' && character <= '8') {
        file += Number(character);
        continue;
      }
      if (file > 7) return null;
      const square = `${FILES[file]}${8 - row}` as Square;
      board.set(square, {
        square,
        type: character.toLowerCase() as PieceSymbol,
        color: character === character.toUpperCase() ? 'w' : 'b',
      });
      file += 1;
    }
    if (file !== 8) return null;
  }
  return board;
}

function samePiece(a: Placed | undefined, b: Placed | undefined): boolean {
  if (!a || !b) return a === b;
  return a.type === b.type && a.color === b.color;
}

/** Distance en cases, pour départager deux pièces identiques candidates. */
function distance(a: Square, b: Square): number {
  return (
    Math.abs(FILES.indexOf(a[0]) - FILES.indexOf(b[0])) +
    Math.abs(Number(a[1]) - Number(b[1]))
  );
}

/**
 * Trajets à animer pour passer de `beforeFen` à `afterFen`.
 *
 * Renvoie une liste vide dès que la transition n'est pas un coup : rien à
 * animer vaut mieux qu'une pièce qui traverse l'échiquier de travers.
 */
export function pieceTravels(beforeFen: string, afterFen: string): PieceTravel[] {
  if (beforeFen === afterFen) return [];

  const before = readPlacement(beforeFen);
  const after = readPlacement(afterFen);
  if (!before || !after) return [];

  const vacated: Placed[] = [];
  for (const [square, piece] of before) {
    if (!samePiece(piece, after.get(square))) vacated.push(piece);
  }

  const arrived: Placed[] = [];
  for (const [square, piece] of after) {
    if (!samePiece(piece, before.get(square))) arrived.push(piece);
  }

  if (arrived.length === 0 || arrived.length > MAX_TRAVELS) return [];

  const travels: PieceTravel[] = [];
  for (const target of arrived) {
    // La promotion change le type : la pièce qui arrive vient du pion de la
    // même couleur, pas d'une dame partie de nulle part.
    const candidates = vacated.filter(
      (piece) =>
        piece.color === target.color &&
        (piece.type === target.type || piece.type === 'p')
    );
    if (candidates.length === 0) return [];

    const source = candidates.reduce((best, piece) =>
      distance(piece.square, target.square) < distance(best.square, target.square)
        ? piece
        : best
    );
    vacated.splice(vacated.indexOf(source), 1);

    travels.push({
      from: source.square,
      to: target.square,
      type: target.type,
      color: target.color,
    });
  }

  // Deux pièces à la fois ne peut être qu'un roque : sinon c'est le signe
  // que `beforeFen`/`afterFen` ne sont pas deux positions consécutives (une
  // image intermédiaire jamais peinte, un coup manqué) — le diff a recollé
  // deux coups réels en un trajet inventé. Mieux vaut basculer sans
  // animation qu'en montrer une fausse.
  if (travels.length === 2 && !isCastle(travels)) return [];

  return travels;
}

function isCastle(travels: PieceTravel[]): boolean {
  const king = travels.find((travel) => travel.type === 'k');
  const rook = travels.find((travel) => travel.type === 'r');
  if (!king || !rook || king === rook || king.color !== rook.color) return false;
  if (king.from[1] !== king.to[1]) return false;
  const fileDelta = Math.abs(FILES.indexOf(king.to[0]) - FILES.indexOf(king.from[0]));
  return fileDelta === 2;
}
