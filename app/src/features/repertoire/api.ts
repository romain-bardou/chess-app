import { supabase } from '@/lib/supabase';
import type { RepertoireNode } from '@/lib/types';

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

/** Remet tout le camp à « jamais revu » : efface l'état FSRS et les fins de
 * variante marquées maîtrisées. Irréversible côté données (pas de undo). */
export async function resetRepertoireProgress(side: 'white' | 'black'): Promise<void> {
  const { error } = await supabase
    .from('repertoire_nodes')
    .update({
      fsrs_stability: null,
      fsrs_difficulty: null,
      fsrs_due_at: null,
      fsrs_card: null,
      clean: false,
    })
    .eq('side', side);
  if (error) throw error;
}
