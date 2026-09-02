/**
 * Traduction minimale, sans dépendance.
 *
 * L'interface est en français, mais aucune chaîne n'est écrite en dur dans les
 * composants : ajouter l'anglais reviendra à déposer un `en.json` avec les
 * mêmes clés et à appeler `setLocale('en')`.
 */
import fr from '@/locales/fr.json';

const locales = { fr } as const;

export type Locale = keyof typeof locales;
export type TranslationKey = keyof typeof fr;

let current: Locale = 'fr';

export function setLocale(locale: Locale): void {
  current = locale;
}

export function getLocale(): Locale {
  return current;
}

/**
 * Traduit une clé. Les variables `{nom}` du message sont remplacées par
 * `vars.nom`. Une clé absente est renvoyée telle quelle plutôt que de faire
 * planter l'écran.
 */
export function t(
  key: TranslationKey,
  vars?: Record<string, string | number>
): string {
  const table = locales[current] as Record<string, string>;
  const template = table[key];
  if (template === undefined) return key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  );
}

/** Libellé d'un thème tactique ; la clé brute sert de repli si non traduite. */
export function translateTheme(theme: string): string {
  const key = `theme.${theme}` as TranslationKey;
  const label = t(key);
  return label === key ? theme : label;
}
