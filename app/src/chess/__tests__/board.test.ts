import type { Square } from 'chess.js';

import {
  ALL_SQUARES,
  isLightSquare,
  pointToSquare,
  squareToPoint,
} from '@/chess/squares';
import { buildFrames } from '@/features/review/useLineReplay';

const SQUARE_SIZE = 40;

describe('repérage des cases', () => {
  it('fait l aller-retour case → point → case dans les deux orientations', () => {
    for (const orientation of ['w', 'b'] as const) {
      for (const square of ALL_SQUARES) {
        const { x, y } = squareToPoint(square, orientation, SQUARE_SIZE);
        const centre = pointToSquare(
          x + SQUARE_SIZE / 2,
          y + SQUARE_SIZE / 2,
          orientation,
          SQUARE_SIZE
        );
        expect(centre).toBe(square);
      }
    }
  });

  it('place a1 en bas à gauche pour les Blancs, en haut à droite pour les Noirs', () => {
    expect(squareToPoint('a1', 'w', SQUARE_SIZE)).toEqual({ x: 0, y: 280 });
    expect(squareToPoint('a1', 'b', SQUARE_SIZE)).toEqual({ x: 280, y: 0 });
  });

  it('renvoie null hors de l échiquier', () => {
    expect(pointToSquare(-1, 10, 'w', SQUARE_SIZE)).toBeNull();
    expect(pointToSquare(10, 8 * SQUARE_SIZE + 1, 'w', SQUARE_SIZE)).toBeNull();
  });

  it('donne a1 foncée et h1 claire', () => {
    expect(isLightSquare('a1' as Square)).toBe(false);
    expect(isLightSquare('h1' as Square)).toBe(true);
  });
});

describe('buildFrames', () => {
  const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';

  it('produit une position de plus que le nombre de coups', () => {
    const frames = buildFrames(fen, [
      { san: 'Rd2', uci: 'd1d2' },
      { san: 'Qxd2+', uci: 'd5d2' },
    ]);
    expect(frames).toHaveLength(3);
    expect(frames[0].lastMove).toBeNull();
    expect(frames[2].lastMove).toEqual({ from: 'd5', to: 'd2' });
  });

  it('accepte un coup fourni en SAN seul', () => {
    const frames = buildFrames(fen, [{ san: 'Rd2', uci: '' }]);
    expect(frames).toHaveLength(2);
    expect(frames[1].lastMove).toEqual({ from: 'd1', to: 'd2' });
  });

  it('tronque la variante sur un coup illégal au lieu de planter', () => {
    const frames = buildFrames(fen, [
      { san: 'Rd2', uci: 'd1d2' },
      { san: '??', uci: 'a1a8' },
    ]);
    expect(frames).toHaveLength(2);
  });
});
