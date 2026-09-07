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

/**
 * Ce que rapporte la solution d'un puzzle. Une carte n'est créée que si la
 * variante correcte débouche sur l'un des deux.
 */
export type SolutionGain =
  | { type: 'mate' }
  /** Pions gagnés par rapport à la position de départ. */
  | { type: 'material'; value: number };

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
  /** Coup adverse qui a amené la position. Null sur les cartes d'avant la 005. */
  previous_move: LineMove | null;
  accepted_moves: AcceptedMove[];
  /**
   * Variante à jouer, en alternance (solveur, adversaire, solveur, …), coupée
   * dès que le gain est encaissé. Null ou vide : puzzle à un seul coup.
   */
  solution: LineMove[] | null;
  solution_gain: SolutionGain | null;
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
