import { supabase } from '@/lib/supabase';
import type {
  BoxStats,
  FsrsStateStats,
  GlobalStats,
  Mistake,
  StoredFsrsCard,
  ThemeStat,
} from '@/lib/types';

/** Taille d'un lot de révision : au-delà, on rechargera. */
const QUEUE_SIZE = 60;

/**
 * Filtre de boîte pour la file de révision.
 *
 * `''` (tous) couvre new+unvalidated+validated — `mastered` n'apparaît que
 * choisi explicitement, une carte comprise n'a plus rien à y faire.
 */
export type BoxFilter = '' | 'new' | 'unvalidated' | 'mastered';

/**
 * Cartes à réviser, les moins avancées d'abord (new, puis unvalidated, puis
 * validated), les plus en retard d'abord à égalité de boîte.
 *
 * `new` et `unvalidated` n'ont pas encore d'espacement FSRS qui tienne : pas
 * encore résolues une seule fois proprement, donc pas de raison de les caser
 * à une date précise plutôt qu'une autre. Elles restent dans la file tant
 * qu'elles n'ont pas été validées, indépendamment de `fsrs_due_at`. Seules
 * `validated`/`mastered` respectent l'échéance FSRS.
 *
 * RLS restreint déjà la lecture à mes lignes : pas besoin de filtrer sur
 * `user_id` côté client.
 */
export async function fetchDueMistakes(
  theme?: string | null,
  boxFilter: BoxFilter = ''
): Promise<Mistake[]> {
  const now = new Date().toISOString();
  let query = supabase.from('mistakes').select('*');

  if (boxFilter === 'new' || boxFilter === 'unvalidated') {
    query = query.eq('box', boxFilter);
  } else if (boxFilter === 'mastered') {
    query = query.eq('box', 'mastered').lte('fsrs_due_at', now);
  } else {
    query = query.or(
      `box.in.(new,unvalidated),and(box.eq.validated,fsrs_due_at.lte.${now})`
    );
  }

  query = query
    // Alphabétique = ordre voulu ici : new < unvalidated < validated.
    .order('box', { ascending: true })
    .order('fsrs_due_at', { ascending: true })
    // Les cartes d'une partie sont insérées d'un bloc, donc à la même
    // échéance : sans second critère, leur ordre serait celui du hasard.
    .order('game_id', { ascending: true })
    .order('ply_number', { ascending: true })
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

/**
 * Répartition des cartes par état `ts-fsrs` (New/Learning/Review/Relearning).
 *
 * Pas de fonction SQL dédiée : `fsrs_card` est un jsonb, léger à rapatrier en
 * entier, et l'agrégation par état n'a d'intérêt que pour cet écran.
 */
export async function fetchFsrsStateStats(): Promise<FsrsStateStats> {
  const { data, error } = await supabase.from('mistakes').select('fsrs_card');
  if (error) throw error;

  const stats: FsrsStateStats = { new: 0, learning: 0, review: 0, relearning: 0 };
  for (const row of (data ?? []) as { fsrs_card: StoredFsrsCard | null }[]) {
    const state = row.fsrs_card?.state ?? 0;
    if (state === 1) stats.learning += 1;
    else if (state === 2) stats.review += 1;
    else if (state === 3) stats.relearning += 1;
    else stats.new += 1;
  }
  return stats;
}

/** Répartition des puzzles par boîte (voir `ReviewBox`), pour l'écran Stats. */
export async function fetchMistakeBoxStats(): Promise<BoxStats> {
  const { data, error } = await supabase.from('mistakes').select('box');
  if (error) throw error;

  const stats: BoxStats = { new: 0, unvalidated: 0, validated: 0, mastered: 0 };
  for (const row of (data ?? []) as { box: keyof BoxStats }[]) {
    stats[row.box] += 1;
  }
  return stats;
}
