/**
 * Parcours de l'arbre de répertoire.
 *
 * Un nœud alterne : soit c'est mon trait (un seul coup préparé — le plus en
 * retard FSRS l'emporte s'il y en avait plusieurs), soit celui de
 * l'adversaire (plusieurs réponses possibles, tirées au sort selon leur
 * popularité réelle sur Lichess).
 */
import type { RepertoireNode } from '@/lib/types';

/** Clé des nœuds racine (`parent_node_id` nul), qui n'a pas d'UUID. */
export const ROOT = 'root';

export function groupByParent(nodes: RepertoireNode[]): Map<string, RepertoireNode[]> {
  const map = new Map<string, RepertoireNode[]>();
  for (const node of nodes) {
    const key = node.parent_node_id ?? ROOT;
    const list = map.get(key);
    if (list) list.push(node);
    else map.set(key, [node]);
  }
  return map;
}

/** Camp au trait pour un groupe de frères (même position de départ). */
export function sideToMoveAt(children: RepertoireNode[], rootFen: string): 'w' | 'b' {
  const fen = children[0]?.fen ?? rootFen;
  return fen.split(' ')[1] === 'b' ? 'b' : 'w';
}

/** `fsrs_due_at` n'a pas de défaut en base : jamais révisé vaut « toujours en retard ». */
function dueTime(node: RepertoireNode): number {
  return node.fsrs_due_at ? new Date(node.fsrs_due_at).getTime() : 0;
}

/** Coup à faire trouver : le mien le plus en retard côté FSRS. */
export function pickMyNode(children: RepertoireNode[]): RepertoireNode {
  return children.reduce((best, node) => (dueTime(node) < dueTime(best) ? node : best));
}

/** Réponse adverse simulée, tirée au sort selon la popularité réelle des coups. */
export function pickOpponentNode(children: RepertoireNode[]): RepertoireNode {
  const weights = children.map((node) => Math.max(node.popularity ?? 0, 0.0001));
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let roll = Math.random() * total;
  for (let index = 0; index < children.length; index += 1) {
    roll -= weights[index];
    if (roll <= 0) return children[index];
  }
  return children[children.length - 1];
}
