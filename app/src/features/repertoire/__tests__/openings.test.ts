import { OPENINGS, isOpening, openingNodes } from '../openings';
import type { RepertoireNode } from '@/lib/types';

function node(id: string, san: string, parent: string | null, side: 'white' | 'black'): RepertoireNode {
  return {
    id,
    fen: '',
    side,
    parent_node_id: parent,
    move_san: san,
    source: null,
    popularity: null,
    is_book_end: false,
    card_type: 'repertoire_line',
    fsrs_stability: null,
    fsrs_difficulty: null,
    fsrs_due_at: null,
    fsrs_card: null,
    box: 'new',
    created_at: '',
  };
}

// 1.e4 racine commune ; 1...e5 2.Nf3 (Écossaise) et 1...d5 2.exd5 (Scandinave).
const white = [
  node('n1', 'e4', null, 'white'),
  node('e5', 'e5', 'n1', 'white'),
  node('nf3', 'Nf3', 'e5', 'white'),
  node('nc6', 'Nc6', 'nf3', 'white'),
  node('d5', 'd5', 'n1', 'white'),
  node('exd5', 'exd5', 'd5', 'white'),
  node('qxd5', 'Qxd5', 'exd5', 'white'),
];

const ids = (nodes: RepertoireNode[]) => nodes.map((n) => n.id).sort();

describe('openingNodes', () => {
  it('garde la racine partagée et la branche de l’Écossaise seulement', () => {
    expect(ids(openingNodes(white, 'scotch'))).toEqual(['e5', 'n1', 'nc6', 'nf3']);
  });

  it('garde la racine partagée et la branche du Scandinave seulement', () => {
    expect(ids(openingNodes(white, 'scandinavian'))).toEqual(['d5', 'exd5', 'n1', 'qxd5']);
  });

  it('ne garde que la racine si la branche n’existe pas encore', () => {
    const onlyScotch = white.filter((n) => !['d5', 'exd5', 'qxd5'].includes(n.id));
    expect(ids(openingNodes(onlyScotch, 'scandinavian'))).toEqual(['n1']);
  });

  it('renvoie tout l’arbre d’un camp qui n’a qu’une ouverture', () => {
    const black = [node('b1', 'e4', null, 'black'), node('b2', 'c6', 'b1', 'black')];
    expect(openingNodes(black, 'caroKann')).toBe(black);
  });
});

describe('OPENINGS', () => {
  it('range chaque ouverture dans son camp', () => {
    expect(OPENINGS.scotch.side).toBe('white');
    expect(OPENINGS.scandinavian.side).toBe('white');
    expect(OPENINGS.caroKann.side).toBe('black');
  });

  it('reconnaît un identifiant d’ouverture', () => {
    expect(isOpening('scandinavian')).toBe(true);
    expect(isOpening('white')).toBe(false);
    expect(isOpening(undefined)).toBe(false);
  });
});
