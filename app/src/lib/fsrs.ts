/**
 * Notation automatique et planification FSRS.
 *
 * Pas d'auto-évaluation : la note se déduit du résultat et du temps mis. Le
 * barème de temps est calibré sur la longueur de la réfutation — plus la
 * variante à voir est longue, plus la position mérite de temps.
 */
import { createEmptyCard, fsrs, generatorParameters, Rating } from 'ts-fsrs';
import type { Card, CardInput, Grade } from 'ts-fsrs';

import type { Mistake, RepertoireNode, StoredFsrsCard } from '@/lib/types';

/** Paramètres par défaut de ts-fsrs : une seule mémoire pour l'instant. */
const scheduler = fsrs(generatorParameters());

/**
 * Temps de base accordé, quelle que soit la position.
 *
 * Le barème est délibérément serré : un puzzle à un seul coup se résout en
 * 10-30 s, donc un temps attendu trop généreux noterait tout « Easy » et FSRS
 * repousserait les cartes bien trop loin.
 */
export const BASE_SECONDS = 10;
/** Temps ajouté par demi-coup de variante à voir. */
export const SECONDS_PER_PLY = 5;
/** En dessous de ce ratio du temps attendu, la carte est jugée facile. */
export const EASY_RATIO = 0.6;
/** Au-dessus de ce ratio, la carte est jugée difficile. */
export const HARD_RATIO = 1.2;

/** Temps attendu, en secondes, pour résoudre une carte. */
export function expectedSeconds(punishmentPlies: number): number {
  return BASE_SECONDS + SECONDS_PER_PLY * punishmentPlies;
}

/**
 * Note FSRS déduite de la tentative.
 *
 * Un échec vaut toujours « Again » : le temps mis n'a alors aucune valeur
 * informative.
 */
export function gradeAttempt(
  correct: boolean,
  elapsedSeconds: number,
  punishmentPlies: number
): Grade {
  if (!correct) return Rating.Again;
  const expected = expectedSeconds(punishmentPlies);
  const ratio = elapsedSeconds / expected;
  if (ratio < EASY_RATIO) return Rating.Easy;
  if (ratio <= HARD_RATIO) return Rating.Good;
  return Rating.Hard;
}

export const GRADE_LABELS: Record<Grade, 'Again' | 'Hard' | 'Good' | 'Easy'> = {
  [Rating.Again]: 'Again',
  [Rating.Hard]: 'Hard',
  [Rating.Good]: 'Good',
  [Rating.Easy]: 'Easy',
};

/** Reconstruit la Card ts-fsrs à partir de la ligne Supabase (`mistakes` ou `repertoire_nodes`). */
export function toCard(
  row: { fsrs_card: StoredFsrsCard | null },
  now: Date = new Date()
): CardInput | Card {
  const stored = row.fsrs_card;
  if (!stored) return createEmptyCard(now);
  return {
    due: stored.due,
    stability: stored.stability,
    difficulty: stored.difficulty,
    elapsed_days: stored.elapsed_days,
    scheduled_days: stored.scheduled_days,
    learning_steps: stored.learning_steps,
    reps: stored.reps,
    lapses: stored.lapses,
    state: stored.state,
    last_review: stored.last_review ?? null,
  };
}

/** Sérialisation JSON de la Card, pour la colonne `fsrs_card`. */
export function serializeCard(card: Card): StoredFsrsCard {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: card.elapsed_days,
    scheduled_days: card.scheduled_days,
    learning_steps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    last_review: card.last_review ? card.last_review.toISOString() : null,
  };
}

export interface ReviewOutcome {
  grade: Grade;
  card: Card;
  /** Colonnes à écrire dans `mistakes`. */
  update: {
    fsrs_card: StoredFsrsCard;
    fsrs_stability: number;
    fsrs_difficulty: number;
    fsrs_due_at: string;
    times_seen: number;
    times_correct: number;
    times_incorrect: number;
  };
}

/**
 * Calcule le nouvel état de la carte après une tentative.
 *
 * `fsrs_stability` / `fsrs_difficulty` / `fsrs_due_at` sont la projection
 * interrogeable de `fsrs_card` : les trois restent cohérents.
 */
export function reviewMistake(
  mistake: Mistake,
  correct: boolean,
  elapsedSeconds: number,
  now: Date = new Date()
): ReviewOutcome {
  // La longueur de référence est celle de la plus longue des deux variantes :
  // un puzzle en trois coups demande plus de temps qu'une réfutation courte.
  const plies = Math.max(
    mistake.punishment_pv.length,
    mistake.solution?.length ?? 0
  );
  const grade = gradeAttempt(correct, elapsedSeconds, plies);
  const { card } = scheduler.next(toCard(mistake, now), now, grade);

  return {
    grade,
    card,
    update: {
      fsrs_card: serializeCard(card),
      fsrs_stability: card.stability,
      fsrs_difficulty: card.difficulty,
      fsrs_due_at: card.due.toISOString(),
      times_seen: mistake.times_seen + 1,
      times_correct: mistake.times_correct + (correct ? 1 : 0),
      times_incorrect: mistake.times_incorrect + (correct ? 0 : 1),
    },
  };
}

export interface RepertoireReviewOutcome {
  grade: Grade;
  card: Card;
  /** Colonnes à écrire dans `repertoire_nodes` : pas de compteurs times_*, contrairement à `mistakes`. */
  update: {
    fsrs_card: StoredFsrsCard;
    fsrs_stability: number;
    fsrs_difficulty: number;
    fsrs_due_at: string;
  };
}

/**
 * Calcule le nouvel état d'une ligne de répertoire après une tentative.
 *
 * Un seul coup à retrouver par carte (pas de variante à voir derrière) : le
 * barème de temps reste le plus serré, `expectedSeconds(0)`.
 */
export function reviewRepertoireNode(
  node: RepertoireNode,
  correct: boolean,
  elapsedSeconds: number,
  now: Date = new Date()
): RepertoireReviewOutcome {
  const grade = gradeAttempt(correct, elapsedSeconds, 0);
  const { card } = scheduler.next(toCard(node, now), now, grade);

  return {
    grade,
    card,
    update: {
      fsrs_card: serializeCard(card),
      fsrs_stability: card.stability,
      fsrs_difficulty: card.difficulty,
      fsrs_due_at: card.due.toISOString(),
    },
  };
}
