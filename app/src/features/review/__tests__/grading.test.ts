import { isAcceptedMove, toUci } from '@/features/review/grading';
import type { AcceptedMove } from '@/lib/types';

const accepted: AcceptedMove[] = [
  { san: 'Rxd5', uci: 'd1d5', cp: 900, mate: null, pv: [] },
  { san: 'Rd4', uci: 'd1d4', cp: 850, mate: null, pv: [] },
];

describe('isAcceptedMove', () => {
  it('accepte le meilleur coup', () => {
    expect(
      isAcceptedMove({ from: 'd1', to: 'd5', san: 'Rxd5' }, accepted)
    ).toBe(true);
  });

  it('accepte une autre continuation non sanctionnée', () => {
    expect(isAcceptedMove({ from: 'd1', to: 'd4', san: 'Rd4' }, accepted)).toBe(
      true
    );
  });

  it('refuse un coup absent de la liste', () => {
    expect(isAcceptedMove({ from: 'd1', to: 'd2', san: 'Rd2' }, accepted)).toBe(
      false
    );
  });

  it('distingue les promotions par leur pièce', () => {
    const promotions: AcceptedMove[] = [
      { san: 'e8=N+', uci: 'e7e8n', cp: 400, mate: null, pv: [] },
    ];
    expect(
      isAcceptedMove(
        { from: 'e7', to: 'e8', promotion: 'n', san: 'e8=N+' },
        promotions
      )
    ).toBe(true);
    expect(
      isAcceptedMove(
        { from: 'e7', to: 'e8', promotion: 'q', san: 'e8=Q' },
        promotions
      )
    ).toBe(false);
  });

  it('retombe sur le SAN quand l UCI est absent', () => {
    const sanOnly: AcceptedMove[] = [
      { san: 'Rxd5', uci: '', cp: 900, mate: null, pv: [] },
    ];
    expect(isAcceptedMove({ from: 'd1', to: 'd5', san: 'Rxd5' }, sanOnly)).toBe(
      true
    );
  });
});

describe('toUci', () => {
  it('concatène la promotion quand elle existe', () => {
    expect(toUci({ from: 'e7', to: 'e8', promotion: 'q', san: 'e8=Q' })).toBe(
      'e7e8q'
    );
    expect(toUci({ from: 'g1', to: 'f3', san: 'Nf3' })).toBe('g1f3');
  });
});
