import { reorderPending, shuffled } from '@/features/review/queueOrder';
import type { Mistake } from '@/lib/types';

/** Carte réduite à son identité : l'ordre est tout ce qu'on teste ici. */
function card(id: string): Mistake {
  return { id } as Mistake;
}

const batch = ['a', 'b', 'c', 'd', 'e'].map(card);

describe('shuffled', () => {
  it('garde les mêmes éléments sans toucher à la source', () => {
    const mixed = shuffled(batch);
    expect(mixed).toHaveLength(batch.length);
    expect(mixed.map((item) => item.id).sort()).toEqual(['a', 'b', 'c', 'd', 'e']);
    expect(batch.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });
});

describe('reorderPending', () => {
  it('laisse en place les cartes déjà vues, carte courante comprise', () => {
    const reordered = reorderPending(batch, 2, batch, true);
    expect(reordered.slice(0, 2).map((item) => item.id)).toEqual(['a', 'b']);
    expect(reordered).toHaveLength(batch.length);
  });

  it('rend leur ordre d’arrivée aux cartes restantes', () => {
    const mixed = reorderPending(batch, 1, batch, true);
    const restored = reorderPending(mixed, 1, batch, false);
    expect(restored.map((item) => item.id)).toEqual(['a', 'b', 'c', 'd', 'e']);
  });

  it('ne ressort pas une carte déjà vue passée dans le désordre', () => {
    const mixed = reorderPending(batch, 1, batch, true);
    const seen = mixed.slice(0, 3).map((item) => item.id);
    const next = reorderPending(mixed, 3, batch, true);
    expect(next.map((item) => item.id).slice(0, 3)).toEqual(seen);
    expect(new Set(next.map((item) => item.id)).size).toBe(batch.length);
  });
});
