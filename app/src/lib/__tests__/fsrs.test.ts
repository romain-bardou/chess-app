import { Rating } from 'ts-fsrs';

import {
  expectedSeconds,
  gradeAttempt,
  reviewMistake,
  serializeCard,
} from '@/lib/fsrs';
import type { Mistake } from '@/lib/types';

function makeMistake(overrides: Partial<Mistake> = {}): Mistake {
  return {
    id: 'card-1',
    game_id: 'game-1',
    fen: '4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1',
    ply_number: 20,
    move_played: 'Rd2',
    accepted_moves: [
      { san: 'Rxd5', uci: 'd1d5', cp: 900, mate: null, pv: [] },
    ],
    punishment_pv: [
      { san: 'Qxd2', uci: 'd5d2' },
      { san: 'Kxd2', uci: 'e1d2' },
    ],
    category: 'blunder',
    themes: ['hangingPiece'],
    card_type: 'mistake',
    fsrs_stability: null,
    fsrs_difficulty: null,
    fsrs_due_at: new Date().toISOString(),
    fsrs_card: null,
    times_seen: 0,
    times_correct: 0,
    times_incorrect: 0,
    ...overrides,
  };
}

describe('barème de temps', () => {
  it('ajoute 5 s par demi-coup de réfutation', () => {
    expect(expectedSeconds(0)).toBe(10);
    expect(expectedSeconds(2)).toBe(20);
    expect(expectedSeconds(8)).toBe(50);
  });
});

describe('gradeAttempt', () => {
  const plies = 2; // temps attendu : 20 s

  it('note Again dès que le coup est raté, quel que soit le temps', () => {
    expect(gradeAttempt(false, 1, plies)).toBe(Rating.Again);
    expect(gradeAttempt(false, 500, plies)).toBe(Rating.Again);
  });

  it('note Easy en dessous de 60 % du temps attendu', () => {
    expect(gradeAttempt(true, 10, plies)).toBe(Rating.Easy);
  });

  it('note Good entre 60 % et 120 %', () => {
    expect(gradeAttempt(true, 15, plies)).toBe(Rating.Good);
    expect(gradeAttempt(true, 24, plies)).toBe(Rating.Good);
  });

  it('note Hard au-delà de 120 %', () => {
    expect(gradeAttempt(true, 30, plies)).toBe(Rating.Hard);
  });
});

describe('reviewMistake', () => {
  it('repousse la carte et incrémente les compteurs après une réussite', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const outcome = reviewMistake(makeMistake(), true, 10, now);

    expect(outcome.update.times_seen).toBe(1);
    expect(outcome.update.times_correct).toBe(1);
    expect(outcome.update.times_incorrect).toBe(0);
    expect(new Date(outcome.update.fsrs_due_at).getTime()).toBeGreaterThan(
      now.getTime()
    );
  });

  it('compte un échec et garde la carte proche', () => {
    const now = new Date('2026-01-01T12:00:00.000Z');
    const outcome = reviewMistake(makeMistake(), false, 90, now);

    expect(outcome.update.times_incorrect).toBe(1);
    expect(outcome.update.times_correct).toBe(0);
  });

  it('reprend l état FSRS stocké au lieu de repartir d une carte neuve', () => {
    const first = reviewMistake(makeMistake(), true, 10);
    const second = reviewMistake(
      makeMistake({
        fsrs_card: first.update.fsrs_card,
        times_seen: 1,
        times_correct: 1,
      }),
      true,
      10
    );

    expect(second.card.reps).toBe(2);
    expect(second.update.times_seen).toBe(2);
  });

  it('garde fsrs_stability et fsrs_due_at cohérents avec fsrs_card', () => {
    const outcome = reviewMistake(makeMistake(), true, 10);
    const serialized = serializeCard(outcome.card);

    expect(outcome.update.fsrs_stability).toBe(serialized.stability);
    expect(outcome.update.fsrs_difficulty).toBe(serialized.difficulty);
    expect(outcome.update.fsrs_due_at).toBe(serialized.due);
  });
});
