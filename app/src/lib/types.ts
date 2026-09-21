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
/**
 * Le dernier coup adverse, avec la position d'où il part quand elle est
 * connue : les cartes d'avant cette version n'ont que le coup, et se posent
 * alors directement sur la position à résoudre.
 */
export interface PreviousMove extends LineMove {
  fen?: string;
}

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

/**
 * Boîte de progression, partagée par `mistakes` et `repertoire_nodes` (voir
 * supabase/migrations/010_mistake_box.sql et 011_repertoire_box.sql).
 */
export type ReviewBox = 'new' | 'unvalidated' | 'validated' | 'mastered';

export interface Mistake {
  id: string;
  game_id: string;
  fen: string;
  ply_number: number;
  move_played: string;
  /** Coup adverse qui a amené la position. Null sur les cartes d'avant la 005. */
  previous_move: PreviousMove | null;
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
  box: ReviewBox;
}

export interface ThemeStat {
  theme: string;
  cards: number;
  seen: number;
  correct: number;
  incorrect: number;
  due: number;
  mastered: number;
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

/** Répartition des cartes par état `ts-fsrs` : New/Learning/Review/Relearning. */
export interface FsrsStateStats {
  new: number;
  learning: number;
  review: number;
  relearning: number;
}

/**
 * Répartition par boîte (voir `ReviewBox`) — pour `mistakes` comme pour les
 * fins de variante de `repertoire_nodes`.
 */
export interface BoxStats {
  new: number;
  unvalidated: number;
  validated: number;
  mastered: number;
}

/**
 * Un nœud du répertoire d'ouvertures (phase 2, `repertoire_nodes`).
 *
 * `fen` est la position AVANT le coup, `move_san` le coup à trouver depuis
 * cette position (voir la convention actée pour le générateur phase 2 :
 * memory `repertoire-nodes-fen-convention`).
 */
export interface RepertoireNode {
  id: string;
  fen: string;
  side: 'white' | 'black' | null;
  parent_node_id: string | null;
  move_san: string | null;
  source: string | null;
  popularity: number | null;
  is_book_end: boolean;
  card_type: string;
  fsrs_stability: number | null;
  fsrs_difficulty: number | null;
  /** Contrairement à `mistakes`, pas de défaut en base : nul avant la première révision. */
  fsrs_due_at: string | null;
  fsrs_card: StoredFsrsCard | null;
  /**
   * Boîte de la fin de variante (`is_book_end`) : voir `ReviewBox`. N'a de
   * sens que sur les feuilles — les nœuds intermédiaires la portent sans
   * qu'elle soit lue.
   */
  box: ReviewBox;
  created_at: string;
}
