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

/** Ancêtres de `targetId` (racine en premier), le nœud cible exclu. */
export function ancestorPath(nodes: RepertoireNode[], targetId: string): RepertoireNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const chain: RepertoireNode[] = [];
  let currentId = byId.get(targetId)?.parent_node_id ?? null;
  while (currentId) {
    const node = byId.get(currentId);
    if (!node) break;
    chain.unshift(node);
    currentId = node.parent_node_id;
  }
  return chain;
}

export type FsrsStatus = 'new' | 'due' | 'learned';

function ownStatus(node: RepertoireNode): FsrsStatus {
  if (!node.fsrs_due_at) return 'new';
  return new Date(node.fsrs_due_at).getTime() <= Date.now() ? 'due' : 'learned';
}

const STATUS_RANK: Record<FsrsStatus, number> = { learned: 0, new: 1, due: 2 };
const RANK_STATUS: FsrsStatus[] = ['learned', 'new', 'due'];

/**
 * Statut FSRS « effectif » de chaque coup à nous : une erreur (ou une carte
 * jamais revue) plus haut dans la variante rend le reste non maîtrisé, même
 * si le nœud lui-même a sa propre échéance lointaine — sinon un enfant peut
 * s'afficher acquis juste après un parent en échec, ce qui n'a pas de sens
 * puisqu'on ne l'atteint qu'en ratant le parent.
 */
export function computeEffectiveStatuses(nodes: RepertoireNode[]): Map<string, FsrsStatus> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const cache = new Map<string, FsrsStatus>();

  function resolve(node: RepertoireNode): FsrsStatus {
    const cached = cache.get(node.id);
    if (cached) return cached;
    let rank = node.popularity === null ? STATUS_RANK[ownStatus(node)] : STATUS_RANK.learned;
    const parent = node.parent_node_id ? byId.get(node.parent_node_id) : undefined;
    if (parent) rank = Math.max(rank, STATUS_RANK[resolve(parent)]);
    const status = RANK_STATUS[rank];
    cache.set(node.id, status);
    return status;
  }

  for (const node of nodes) resolve(node);
  return cache;
}
