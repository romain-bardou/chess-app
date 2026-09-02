/** Formes exactes des lignes Supabase manipulées par l'app. */

export type Category = 'inaccuracy' | 'mistake' | 'blunder';

/** Un demi-coup d'une variante, tel que sérialisé par le script d'analyse. */
export interface LineMove {
  san: string;
  uci: string;
}

/**
 * Un coup non sanctionné. Le script en stocke plusieurs : toute continuation
 * qui reste au-dessus du seuil d'imprécision compte comme réussie.
 */
export interface AcceptedMove extends LineMove {
  cp: number | null;
  mate: number | null;
  pv: LineMove[];
}

/** État `ts-fsrs` sérialisé (voir supabase/migrations/004_fsrs_card.sql). */
export interface StoredFsrsCard {
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  learning_steps: number;
  reps: number;
  lapses: number;
  state: number;
  last_review?: string | null;
}

export interface Mistake {
  id: string;
  game_id: string;
  fen: string;
  ply_number: number;
  move_played: string;
  accepted_moves: AcceptedMove[];
  punishment_pv: LineMove[];
  category: Category;
  themes: string[];
  card_type: string;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  fsrs_due_at: string;
  fsrs_card: StoredFsrsCard | null;
  times_seen: number;
  times_correct: number;
  times_incorrect: number;
}

export interface ThemeStat {
  theme: string;
  cards: number;
  seen: number;
  correct: number;
  incorrect: number;
  due: number;
}

export interface GlobalStats {
  cards: number;
  seen: number;
  correct: number;
  incorrect: number;
  due: number;
  inaccuracies: number;
  mistakes_count: number;
  blunders: number;
  games_analyzed: number;
}
