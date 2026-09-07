/**
 * Ordre de la file de révision.
 *
 * Les cartes arrivent groupées par partie, dans l'ordre des coups — celui de
 * leur insertion. C'est commode pour revoir une partie, mais le contexte de la
 * carte précédente souffle la réponse : d'où le mode « aléatoire ».
 */
import type { Mistake } from '@/lib/types';

/** Mélange une copie du tableau (Fisher-Yates). */
export function shuffled<T>(items: T[]): T[] {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
}

/**
 * Réordonne les cartes pas encore vues, en laissant intactes celles qui l'ont
 * déjà été — changer d'ordre en pleine carte ne doit pas l'escamoter.
 *
 * `source` est le lot dans son ordre d'arrivée : c'est lui qui permet de
 * revenir au classement par partie sans redemander Supabase.
 */
export function reorderPending(
  queue: Mistake[],
  seen: number,
  source: Mistake[],
  shuffle: boolean
): Mistake[] {
  const head = queue.slice(0, seen);
  const done = new Set(head.map((card) => card.id));
  const rest = source.filter((card) => !done.has(card.id));
  return [...head, ...(shuffle ? shuffled(rest) : rest)];
}
