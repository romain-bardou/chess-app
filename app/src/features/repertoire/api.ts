import { supabase } from '@/lib/supabase';
import type { BoxStats, RepertoireNode } from '@/lib/types';

/**
 * Tout l'arbre d'un camp (Blancs ou Noirs), pour dérouler la ligne
 * entièrement côté client : la popularité (réponses adverses) et l'échéance
 * FSRS (mes coups) pilotent le parcours coup par coup, pas une requête par
 * demi-coup.
 */
export async function fetchRepertoireTree(
  side: 'white' | 'black'
): Promise<RepertoireNode[]> {
  const { data, error } = await supabase
    .from('repertoire_nodes')
    .select('*')
    .eq('side', side);
  if (error) throw error;
  return (data ?? []) as RepertoireNode[];
}

/** Écrit le nouvel état FSRS après une tentative sur un nœud. */
export async function saveRepertoireReview(
  id: string,
  update: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('repertoire_nodes').update(update).eq('id', id);
  if (error) throw error;
}

/** Nombre de cartes du répertoire (Blancs + Noirs) dues maintenant. */
export async function fetchRepertoireDueCount(): Promise<number> {
  const { count, error } = await supabase
    .from('repertoire_nodes')
    .select('*', { count: 'exact', head: true })
    .lte('fsrs_due_at', new Date().toISOString());
  if (error) throw error;
  return count ?? 0;
}

/**
 * Fins de variante par boîte, Blancs + Noirs confondus (voir `ReviewBox`).
 * `is_book_end` : seules les feuilles portent une progression, les nœuds
 * intermédiaires n'en ont pas.
 */
export async function fetchOpeningsBoxStats(): Promise<BoxStats> {
  const { data, error } = await supabase
    .from('repertoire_nodes')
    .select('box')
    .eq('is_book_end', true);
  if (error) throw error;

  const stats: BoxStats = { new: 0, unvalidated: 0, validated: 0, mastered: 0 };
  for (const row of (data ?? []) as { box: keyof BoxStats }[]) {
    stats[row.box] += 1;
  }
  return stats;
}

/** Remet tout le camp à « jamais revu » : efface l'état FSRS et les boîtes
 * de progression. Irréversible côté données (pas de undo). */
export async function resetRepertoireProgress(side: 'white' | 'black'): Promise<void> {
  const { error } = await supabase
    .from('repertoire_nodes')
    .update({
      fsrs_stability: null,
      fsrs_difficulty: null,
      fsrs_due_at: null,
      fsrs_card: null,
      box: 'new',
    })
    .eq('side', side);
  if (error) throw error;
}
