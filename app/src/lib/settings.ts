/**
 * Préférences de révision, conservées d'une session à l'autre.
 *
 * Elles ne concernent que le confort d'affichage : perdre le stockage remet
 * simplement les valeurs par défaut, rien ne dépend d'elles côté données.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';

const PREFIX = 'atelier.settings.';

/** Rejoue automatiquement l'enchaînement attendu après une erreur. */
export const AUTO_PLAY_LINE = 'autoPlayLine';

/**
 * Booléen persistant.
 *
 * La valeur par défaut est rendue immédiatement, la valeur stockée arrive au
 * rendu suivant : un réglage de confort ne justifie pas un écran d'attente.
 */
export function useStoredFlag(
  key: string,
  fallback: boolean
): [boolean, (value: boolean) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PREFIX + key)
      .then((stored) => {
        if (!cancelled && stored !== null) setValue(stored === 'true');
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    (next: boolean) => {
      setValue(next);
      AsyncStorage.setItem(PREFIX + key, String(next)).catch(() => undefined);
    },
    [key]
  );

  return [value, update];
}
