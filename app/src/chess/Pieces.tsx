/**
 * Silhouettes de pièces, dessinées à la main en SVG.
 *
 * Tracés originaux : les jeux de pièces libres courants (Cburnett & co.) sont
 * sous licence à attribution, ce qui est une contrainte inutile pour une app
 * publiée sur l'App Store.
 *
 * Toutes les formes vivent dans une boîte 0-100 ; le composant les met à
 * l'échelle de la case.
 */
import { memo, type ReactElement } from 'react';
import { Circle, G, Path } from 'react-native-svg';

import { Board } from '@/theme/atelier';

export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

type Shape =
  | { kind: 'path'; d: string }
  | { kind: 'circle'; cx: number; cy: number; r: number };

const path = (d: string): Shape => ({ kind: 'path', d });
const circle = (cx: number, cy: number, r: number): Shape => ({
  kind: 'circle',
  cx,
  cy,
  r,
});

/** Socle commun à toutes les pièces. */
const BASE = path('M24 76 L76 76 L80 88 Q80 92 76 92 L24 92 Q20 92 20 88 Z');

const SHAPES: Record<PieceSymbol, Shape[]> = {
  p: [
    circle(50, 32, 14),
    path('M38 44 C40 56, 36 64, 29 76 L71 76 C64 64, 60 56, 62 44 Z'),
    BASE,
  ],
  r: [
    path(
      'M26 18 L37 18 L37 26 L44 26 L44 18 L56 18 L56 26 L63 26 L63 18 L74 18 L74 34 L26 34 Z'
    ),
    path('M33 34 L67 34 L64 76 L36 76 Z'),
    BASE,
  ],
  n: [
    path(
      'M32 78 C30 62, 35 54, 45 48 C40 49, 34 48, 29 44 C26 41, 28 37, 33 35 ' +
        'C38 27, 44 21, 52 19 L49 10 L60 16 C70 21, 77 34, 77 52 C77 64, 73 71, 71 78 Z'
    ),
    BASE,
  ],
  b: [
    circle(50, 12, 6.5),
    path(
      'M50 18 C63 30, 71 39, 71 51 C71 62, 61 69, 50 69 C39 69, 29 62, 29 51 C29 39, 37 30, 50 18 Z'
    ),
    path('M35 69 L65 69 L67 76 L33 76 Z'),
    BASE,
  ],
  q: [
    path(
      'M18 30 L27 58 L36 24 L44 58 L50 18 L56 58 L64 24 L73 58 L82 30 L74 76 L26 76 Z'
    ),
    circle(18, 28, 5.5),
    circle(36, 22, 5.5),
    circle(50, 16, 6.5),
    circle(64, 22, 5.5),
    circle(82, 28, 5.5),
    BASE,
  ],
  k: [
    path(
      'M45 6 L55 6 L55 16 L65 16 L65 26 L55 26 L55 38 L45 38 L45 26 L35 26 L35 16 L45 16 Z'
    ),
    path('M27 46 C34 36, 42 32, 50 32 C58 32, 66 36, 73 46 L68 76 L32 76 Z'),
    BASE,
  ],
};

/** Détails dessinés dans la couleur opposée : œil du cavalier, fente du fou. */
const DETAILS: Partial<Record<PieceSymbol, Shape[]>> = {
  n: [circle(45, 36, 3.2)],
  b: [path('M46 30 L54 30 L54 50 L46 50 Z')],
};

function renderShape(shape: Shape, key: string, props: object): ReactElement {
  return shape.kind === 'path' ? (
    <Path key={key} d={shape.d} {...props} />
  ) : (
    <Circle key={key} cx={shape.cx} cy={shape.cy} r={shape.r} {...props} />
  );
}

interface PieceProps {
  type: PieceSymbol;
  color: PieceColor;
  /** Côté de la case, en points. */
  size: number;
  x: number;
  y: number;
  opacity?: number;
}

// `drop-shadow(0 3px 4px …)` n'a pas d'équivalent SVG portable : on empile
// deux copies décalées et translucides pour obtenir un flou comparable.
const SHADOW_LAYERS = [
  { dy: 2, opacity: 0.2 },
  { dy: 4, opacity: 0.16 },
];

function PieceGlyph({ type, color, size, x, y, opacity = 1 }: PieceProps) {
  const scale = size / 100;
  const fill = color === 'w' ? Board.whitePiece : Board.blackPiece;
  const contrast = color === 'w' ? Board.blackPiece : Board.whitePiece;

  return (
    <G x={x} y={y} opacity={opacity} pointerEvents="none">
      {SHADOW_LAYERS.map((shadow) => (
        <G key={shadow.dy} scale={scale} y={shadow.dy} opacity={shadow.opacity}>
          {SHAPES[type].map((shape, index) =>
            renderShape(shape, `s${index}`, { fill: Board.pieceShadow })
          )}
        </G>
      ))}
      <G scale={scale}>
        {SHAPES[type].map((shape, index) =>
          renderShape(shape, `p${index}`, {
            fill,
            stroke: contrast,
            strokeWidth: 2,
            strokeOpacity: color === 'w' ? 0.55 : 0.25,
            strokeLinejoin: 'round',
          })
        )}
        {(DETAILS[type] ?? []).map((shape, index) =>
          renderShape(shape, `d${index}`, { fill: contrast, opacity: 0.85 })
        )}
      </G>
    </G>
  );
}

export const Piece = memo(PieceGlyph);
