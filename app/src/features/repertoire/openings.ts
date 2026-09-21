/**
 * Les ouvertures du répertoire.
 *
 * En base, un arbre n'existe que par camp (`side`) : l'Écossaise et le
 * Scandinave, tous deux aux Blancs, partagent la même racine 1.e4 et ne se
 * séparent qu'à la réponse adverse (1...e5 ou 1...d5). Une ouverture est donc
 * un camp plus, s'il y en a plusieurs, la branche qui part de cette réponse.
 */
import { ROOT, groupByParent } from '@/features/repertoire/tree';
import type { RepertoireNode } from '@/lib/types';

export type Side = 'white' | 'black';
export type Opening = 'scotch' | 'scandinavian' | 'caroKann';

interface OpeningInfo {
  side: Side;
  /** Clé de traduction du nom affiché dans les filtres. */
  labelKey: 'openings.scotch' | 'openings.scandinavian' | 'openings.caroKann';
  /** Première réponse adverse qui mène à cette ouverture ; nul si le camp n'a qu'une ouverture. */
  firstReply: string | null;
}

export const OPENINGS: Record<Opening, OpeningInfo> = {
  scotch: { side: 'white', labelKey: 'openings.scotch', firstReply: 'e5' },
  scandinavian: { side: 'white', labelKey: 'openings.scandinavian', firstReply: 'd5' },
  caroKann: { side: 'black', labelKey: 'openings.caroKann', firstReply: null },
};

export const OPENING_IDS: Opening[] = ['scotch', 'scandinavian', 'caroKann'];

export function isOpening(value: string | undefined): value is Opening {
  return value !== undefined && value in OPENINGS;
}

/**
 * Nœuds de l'arbre d'un camp qui appartiennent à `opening` : la racine
 * partagée, puis uniquement le sous-arbre de la réponse adverse de cette
 * ouverture. Renvoie tout l'arbre quand le camp n'a qu'une ouverture.
 */
export function openingNodes(nodes: RepertoireNode[], opening: Opening): RepertoireNode[] {
  const { firstReply } = OPENINGS[opening];
  if (firstReply === null) return nodes;

  const byParent = groupByParent(nodes);
  const kept: RepertoireNode[] = [];
  for (const root of byParent.get(ROOT) ?? []) {
    kept.push(root);
    const branch = (byParent.get(root.id) ?? []).find((child) => child.move_san === firstReply);
    const pending = branch ? [branch] : [];
    while (pending.length > 0) {
      const node = pending.pop() as RepertoireNode;
      kept.push(node);
      pending.push(...(byParent.get(node.id) ?? []));
    }
  }
  return kept;
}
