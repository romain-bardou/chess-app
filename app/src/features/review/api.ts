import { supabase } from '@/lib/supabase';
import type {
  DueForecast,
  FsrsStateStats,
  GlobalStats,
  Mistake,
  StoredFsrsCard,
  ThemeStat,
} from '@/lib/types';

/** Nombre de jours à venir couverts par le calendrier de révision. */
const FORECAST_DAYS = 10;

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

/** Calendrier des prochaines échéances, jour par jour. */
export async function fetchDueForecast(): Promise<DueForecast> {
  const { data, error } = await supabase.from('mistakes').select('fsrs_due_at');
  if (error) throw error;

  const dayMs = 24 * 60 * 60 * 1000;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const windowEnd = new Date(startOfToday.getTime() + FORECAST_DAYS * dayMs);

  const counts = new Array<number>(FORECAST_DAYS).fill(0);
  let overdue = 0;
  let later = 0;

  for (const row of (data ?? []) as { fsrs_due_at: string }[]) {
    const due = new Date(row.fsrs_due_at);
    if (due < startOfToday) overdue += 1;
    else if (due >= windowEnd) later += 1;
    else counts[Math.floor((due.getTime() - startOfToday.getTime()) / dayMs)] += 1;
  }

  const days = counts.map((count, offset) => ({
    date: new Date(startOfToday.getTime() + offset * dayMs).toISOString().slice(0, 10),
    count,
  }));

  return { overdue, days, later };
}
