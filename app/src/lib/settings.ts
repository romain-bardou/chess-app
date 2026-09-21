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

/** Bat le lot de révision au lieu de suivre l'ordre des parties. */
export const SHUFFLE_QUEUE = 'shuffleQueue';

/** Flèche indiquant le coup attendu après un coup raté, en Révision et Ouvertures. */
export const SHOW_HINT_ARROW = 'showHintArrow';

/** Thème sur lequel filtrer la file de révision par défaut ; vide = tous. */
export const REVIEW_THEME_FILTER = 'reviewThemeFilter';

/**
 * Boîte sur laquelle filtrer la file de révision ; vide = new+unvalidated+validated
 * (mastered n'apparaît que si on le choisit explicitement).
 */
export const REVIEW_BOX_FILTER = 'reviewBoxFilter';

/** Boutons +/− et pourcentage sur l'arbre de répertoire ; masqués, seul le
 * pincement zoome encore. */
export const SHOW_TREE_ZOOM_CONTROLS = 'showTreeZoomControls';

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

/**
 * Chaîne persistante. Même contrat que `useStoredFlag` : le repli s'affiche
 * tout de suite, la valeur stockée arrive au rendu suivant.
 */
export function useStoredValue(
  key: string,
  fallback: string
): [string, (value: string) => void] {
  const [value, setValue] = useState(fallback);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(PREFIX + key)
      .then((stored) => {
        if (!cancelled && stored !== null) setValue(stored);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [key]);

  const update = useCallback(
    (next: string) => {
      setValue(next);
      AsyncStorage.setItem(PREFIX + key, next).catch(() => undefined);
    },
    [key]
  );

  return [value, update];
}
