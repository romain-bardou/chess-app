import { useCallback, useEffect, useState } from 'react';

import { fetchDueMistakes } from '@/features/review/api';
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
 */
export function useReviewQueue(theme: string | null): ReviewQueue {
  const [queue, setQueue] = useState<Mistake[]>([]);
  const [index, setIndex] = useState(0);
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const rows = await fetchDueMistakes(theme);
      setQueue(rows);
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
