import { Chess } from 'chess.js';

import { pieceTravels } from '@/chess/transitions';

/** FEN obtenue en jouant `moves` depuis `fen`. */
function after(fen: string, ...moves: string[]): string {
  const chess = new Chess(fen);
  for (const move of moves) chess.move(move);
  return chess.fen();
}

const START = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

describe('pieceTravels', () => {
  it('trouve le trajet d un coup simple', () => {
    expect(pieceTravels(START, after(START, 'e4'))).toEqual([
      { from: 'e2', to: 'e4', type: 'p', color: 'w' },
    ]);
  });

  it('ne renvoie rien quand la position ne change pas', () => {
    expect(pieceTravels(START, START)).toEqual([]);
  });

  it('suit la pièce capturée sans inventer de trajet pour elle', () => {
    const fen = '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1';
    expect(pieceTravels(fen, after(fen, 'Rxd5'))).toEqual([
      { from: 'd1', to: 'd5', type: 'r', color: 'w' },
    ]);
  });

  it('déplace le roi et la tour sur un roque', () => {
    const fen = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
    const travels = pieceTravels(fen, after(fen, 'O-O'));
    expect(travels).toHaveLength(2);
    expect(travels).toContainEqual({ from: 'e1', to: 'g1', type: 'k', color: 'w' });
    expect(travels).toContainEqual({ from: 'h1', to: 'f1', type: 'r', color: 'w' });
  });

  it('fait venir la pièce promue depuis la case du pion', () => {
    const fen = '4k3/P7/8/8/8/8/8/4K3 w - - 0 1';
    expect(pieceTravels(fen, after(fen, 'a8=Q'))).toEqual([
      { from: 'a7', to: 'a8', type: 'q', color: 'w' },
    ]);
  });

  it('laisse disparaître sur place le pion pris en passant', () => {
    const fen = '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1';
    expect(pieceTravels(fen, after(fen, 'exd6'))).toEqual([
      { from: 'e5', to: 'd6', type: 'p', color: 'w' },
    ]);
  });

  it('renonce quand la position change trop pour être un coup', () => {
    const other = '4k3/8/8/8/8/8/8/4K3 w - - 0 1';
    expect(pieceTravels(START, other)).toEqual([]);
  });

  it('renonce sur une FEN illisible plutôt que de planter', () => {
    expect(pieceTravels('n importe quoi', START)).toEqual([]);
    expect(pieceTravels(START, '')).toEqual([]);
  });

  it('renonce sur un faux trajet à deux pièces qui n est pas un roque', () => {
    // Deux coups réels recollés en un seul diff (image intermédiaire jamais
    // peinte) : le cavalier a bien bougé, mais le pion « reculé » de c4 à c2
    // trahit que ces deux FEN ne sont pas deux positions consécutives.
    const before = '4k3/8/8/6n1/2P5/8/8/4K3 w - - 0 1';
    const afterFen = '4k3/5n2/8/8/8/8/2P5/4K3 w - - 0 1';
    expect(pieceTravels(before, afterFen)).toEqual([]);
  });
});
