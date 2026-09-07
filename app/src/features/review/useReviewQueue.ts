import { useCallback, useEffect, useRef, useState } from 'react';

import { fetchDueMistakes } from '@/features/review/api';
import { reorderPending, shuffled } from '@/features/review/queueOrder';
import type { Mistake } from '@/lib/types';

type Status = 'loading' | 'ready' | 'error';

export interface ReviewQueue {
  current: Mistake | null;
  remaining: number;
  status: Status;
  error: string | null;
  /** Passe à la carte suivante ; recharge la file une fois épuisée. */
  advance: () => void;
  reload: () => void;
}

/**
 * File de révision : les cartes dues, les plus en retard d'abord.
 *
 * Le lot est chargé d'un coup puis consommé en mémoire — inutile de rappeler
 * Supabase entre deux cartes, et la file reste stable même si une carte
 * révisée n'est plus « due ».
 *
 * `shuffle` bat le lot au lieu de le suivre dans l'ordre d'arrivée, qui
 * regroupe les cartes d'une même partie.
 */
export function useReviewQueue(theme: string | null, shuffle = false): ReviewQueue {
  const [queue, setQueue] = useState<Mistake[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);
  // Le lot tel qu'il est arrivé, et la position courante : lus par des effets
  // qui ne doivent pas se redéclencher quand ils changent.
  const fetched = useRef<Mistake[]>([]);
  const wanted = useRef(shuffle);
  const position = useRef(0);

  useEffect(() => {
    wanted.current = shuffle;
  }, [shuffle]);

  useEffect(() => {
    position.current = index;
  }, [index]);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const rows = await fetchDueMistakes(theme);
      fetched.current = rows;
      setQueue(wanted.current ? shuffled(rows) : rows);
      setIndex(0);
      setStatus('ready');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      setStatus('error');
    }
  }, [theme]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    setQueue((previous) =>
      previous.length === 0
        ? previous
        : reorderPending(previous, position.current + 1, fetched.current, shuffle)
    );
  }, [shuffle]);

  const advance = useCallback(() => {
    setIndex((previous) => {
      const next = previous + 1;
      // Lot épuisé : on repart chercher les cartes devenues dues entre-temps.
      if (next >= queue.length) void load();
      return next;
    });
  }, [queue.length, load]);

  return {
    current: queue[index] ?? null,
    remaining: Math.max(queue.length - index, 0),
    status,
    error,
    advance,
    reload: () => void load(),
  };
}
