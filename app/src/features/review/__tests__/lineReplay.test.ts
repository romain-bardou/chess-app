import type { BoardMove } from '@/chess/Chessboard';
import { buildFrames, exploreFrames } from '@/features/review/useLineReplay';

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

function move(from: string, to: string, san: string): BoardMove {
  return { from, to, san } as BoardMove;
}

describe('buildFrames', () => {
  it('empile une position par coup, la position de départ comprise', () => {
    const frames = buildFrames(START, [
      { san: 'e4', uci: 'e2e4' },
      { san: 'e5', uci: 'e7e5' },
    ]);
    expect(frames).toHaveLength(3);
    expect(frames[0].lastMove).toBeNull();
    expect(frames[2].lastMove).toEqual({ from: 'e7', to: 'e5' });
  });

  it('tronque la variante sur un coup illégal au lieu de planter', () => {
    const frames = buildFrames(START, [
      { san: 'e4', uci: 'e2e4' },
      { san: 'Qh8', uci: 'h1h8' },
    ]);
    expect(frames).toHaveLength(2);
  });
});

describe('exploreFrames', () => {
  const line = buildFrames(START, [
    { san: 'e4', uci: 'e2e4' },
    { san: 'e5', uci: 'e7e5' },
  ]);

  it('prolonge la variante depuis le coup affiché', () => {
    const branch = exploreFrames(line, 2, move('g1', 'f3', 'Nf3'));
    expect(branch).toHaveLength(4);
    expect(branch?.[3].lastMove).toEqual({ from: 'g1', to: 'f3' });
  });

  it('abandonne ce qui suivait le coup depuis lequel on repart', () => {
    const branch = exploreFrames(line, 1, move('d7', 'd5', 'd5'));
    expect(branch).toHaveLength(3);
    expect(branch?.[2].lastMove).toEqual({ from: 'd7', to: 'd5' });
    // La variante d'origine n'est pas touchée : y revenir reste possible.
    expect(line).toHaveLength(3);
    expect(line[2].lastMove).toEqual({ from: 'e7', to: 'e5' });
  });

  it('refuse un coup illégal plutôt que de bouger la position', () => {
    expect(exploreFrames(line, 2, move('a1', 'a5', '??'))).toBeNull();
  });
});
