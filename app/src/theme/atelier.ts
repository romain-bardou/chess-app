/**
 * Charte visuelle « Atelier » : bois texturé, contraste chaud.
 *
 * Les valeurs de l'échiquier sont fixées par la charte et ne doivent pas être
 * dérivées d'un thème système — l'app est volontairement en clair uniquement.
 */

export const Board = {
  /** Case claire : dégradé 155°. */
  light: { from: '#E3C79A', to: '#D2AD76' },
  /** Case foncée : dégradé 155°. */
  dark: { from: '#8B5E34', to: '#6E4623' },
  whitePiece: '#F7F1E3',
  blackPiece: '#3B2412',
  pieceShadow: 'rgba(0, 0, 0, 0.45)',
  /** Angle des dégradés de case, en degrés. */
  gradientAngle: 155,
} as const;

export const Colors = {
  background: '#F7EFE2',
  surface: '#FFFBF3',
  border: '#E0CFB4',
  text: '#3B2412',
  textMuted: '#8A7358',
  accent: '#8B5E34',
  accentText: '#F7F1E3',
  success: '#4C7A3F',
  danger: '#A3402C',
  /** Surbrillance de la case sélectionnée. */
  selected: 'rgba(76, 122, 63, 0.45)',
  /** Pastille des destinations légales. */
  legal: 'rgba(59, 36, 18, 0.28)',
  /** Trace du dernier coup joué. */
  lastMove: 'rgba(204, 160, 60, 0.45)',
} as const;

export const Spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const Radius = {
  sm: 8,
  md: 14,
  lg: 22,
} as const;

export const Typography = {
  title: { fontSize: 26, fontWeight: '700' },
  heading: { fontSize: 19, fontWeight: '700' },
  body: { fontSize: 16, fontWeight: '400' },
  label: { fontSize: 13, fontWeight: '600' },
  mono: { fontSize: 15, fontWeight: '600' },
} as const;
