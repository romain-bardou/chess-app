import type { Color, Square } from 'chess.js';

export const FILES = 'abcdefgh';

export interface Point {
  x: number;
  y: number;
}

/** Coin haut-gauche d'une case, en points, dans le repère de l'échiquier. */
export function squareToPoint(
  square: Square,
  orientation: Color,
  squareSize: number
): Point {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  const column = orientation === 'w' ? file : 7 - file;
  const row = orientation === 'w' ? 7 - rank : rank;
  return { x: column * squareSize, y: row * squareSize };
}

/** Case sous un point, ou `null` si le point tombe hors de l'échiquier. */
export function pointToSquare(
  x: number,
  y: number,
  orientation: Color,
  squareSize: number
): Square | null {
  const column = Math.floor(x / squareSize);
  const row = Math.floor(y / squareSize);
  if (column < 0 || column > 7 || row < 0 || row > 7) return null;
  const file = orientation === 'w' ? column : 7 - column;
  const rank = orientation === 'w' ? 7 - row : row;
  return `${FILES[file]}${rank + 1}` as Square;
}

/** Vrai pour les cases claires (a1 est foncée). */
export function isLightSquare(square: Square): boolean {
  const file = FILES.indexOf(square[0]);
  const rank = Number(square[1]) - 1;
  return (file + rank) % 2 === 1;
}

/** Toutes les cases, rangée 8 en premier — ordre de rendu naturel. */
export const ALL_SQUARES: Square[] = Array.from({ length: 64 }, (_, index) => {
  const file = index % 8;
  const rank = 7 - Math.floor(index / 8);
  return `${FILES[file]}${rank + 1}` as Square;
});
