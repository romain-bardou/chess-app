import { supabase } from '@/lib/supabase';
import type { GlobalStats, Mistake, ThemeStat } from '@/lib/types';

/** Taille d'un lot de révision : au-delà, on rechargera. */
const QUEUE_SIZE = 60;

/**
 * Cartes dues, les plus en retard d'abord.
 *
 * RLS restreint déjà la lecture à mes lignes : pas besoin de filtrer sur
 * `user_id` côté client.
 */
export async function fetchDueMistakes(theme?: string | null): Promise<Mistake[]> {
  let query = supabase
    .from('mistakes')
    .select('*')
    .lte('fsrs_due_at', new Date().toISOString())
    .order('fsrs_due_at', { ascending: true })
    .limit(QUEUE_SIZE);

  if (theme) query = query.contains('themes', [theme]);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as Mistake[];
}

/** Écrit le nouvel état FSRS et les compteurs après une tentative. */
export async function saveReview(
  id: string,
  update: Record<string, unknown>
): Promise<void> {
  const { error } = await supabase.from('mistakes').update(update).eq('id', id);
  if (error) throw error;
}

export async function fetchThemeStats(): Promise<ThemeStat[]> {
  const { data, error } = await supabase.rpc('theme_stats');
  if (error) throw error;
  return (data ?? []) as ThemeStat[];
}

export async function fetchGlobalStats(): Promise<GlobalStats | null> {
  const { data, error } = await supabase.rpc('global_stats');
  if (error) throw error;
  const rows = (data ?? []) as GlobalStats[];
  return rows[0] ?? null;
}
