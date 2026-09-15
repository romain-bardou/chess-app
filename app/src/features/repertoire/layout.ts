/**
 * Positionnement de l'arbre en diagramme (racine en haut, profondeur vers le
 * bas, frères espacés par le nombre de feuilles sous chacun — l'algorithme
 * classique qui évite les chevauchements sans jamais avoir à les détecter).
 */
import { ROOT, groupByParent } from '@/features/repertoire/tree';
import type { RepertoireNode } from '@/lib/types';

export interface PositionedNode {
  node: RepertoireNode;
  x: number;
  y: number;
}

export interface TreeEdge {
  from: PositionedNode;
  to: PositionedNode;
}

export interface TreeLayout {
  nodes: PositionedNode[];
  edges: TreeEdge[];
  width: number;
  height: number;
}

export const COL_WIDTH = 60;
export const ROW_HEIGHT = 84;
const MARGIN = 40;

export function computeTreeLayout(allNodes: RepertoireNode[]): TreeLayout {
  const childrenMap = groupByParent(allNodes);
  const roots = childrenMap.get(ROOT) ?? [];
  const positions = new Map<string, PositionedNode>();
  const edges: TreeEdge[] = [];
  let nextSlot = 0;
  let maxDepth = 0;

  function place(node: RepertoireNode, depth: number): number {
    maxDepth = Math.max(maxDepth, depth);
    const kids = childrenMap.get(node.id) ?? [];
    let x: number;
    if (kids.length === 0) {
      x = nextSlot;
      nextSlot += 1;
    } else {
      const childXs = kids.map((kid) => place(kid, depth + 1));
      x = (childXs[0] + childXs[childXs.length - 1]) / 2;
    }
    const positioned: PositionedNode = {
      node,
      x: x * COL_WIDTH + MARGIN,
      y: depth * ROW_HEIGHT + MARGIN,
    };
    positions.set(node.id, positioned);
    for (const kid of kids) {
      const child = positions.get(kid.id);
      if (child) edges.push({ from: positioned, to: child });
    }
    return x;
  }

  for (const root of roots) {
    place(root, 0);
  }

  return {
    nodes: Array.from(positions.values()),
    edges,
    width: nextSlot * COL_WIDTH + MARGIN * 2,
    // +16 pour l'icône « maîtrisée » sous les feuilles, en bas du dernier rang.
    height: (maxDepth + 1) * ROW_HEIGHT + MARGIN * 2 + 16,
  };
}
