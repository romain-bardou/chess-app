/**
 * Silhouettes de pièces : jeu « ocean » (chess.com), en PNG.
 *
 * Jeu d'origine non libre — l'app n'étant pas destinée à l'App Store, la
 * contrainte de licence qui écartait Cburnett & co. ne s'applique plus ici.
 */
import { memo } from 'react';
import { Image } from 'react-native-svg';

export type PieceSymbol = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';
export type PieceColor = 'w' | 'b';

const PIECE_IMAGES: Record<PieceColor, Record<PieceSymbol, number>> = {
  w: {
    p: require('@/assets/images/pieces/ocean/wp.png'),
    n: require('@/assets/images/pieces/ocean/wn.png'),
    b: require('@/assets/images/pieces/ocean/wb.png'),
    r: require('@/assets/images/pieces/ocean/wr.png'),
    q: require('@/assets/images/pieces/ocean/wq.png'),
    k: require('@/assets/images/pieces/ocean/wk.png'),
  },
  b: {
    p: require('@/assets/images/pieces/ocean/bp.png'),
    n: require('@/assets/images/pieces/ocean/bn.png'),
    b: require('@/assets/images/pieces/ocean/bb.png'),
    r: require('@/assets/images/pieces/ocean/br.png'),
    q: require('@/assets/images/pieces/ocean/bq.png'),
    k: require('@/assets/images/pieces/ocean/bk.png'),
  },
};

interface PieceProps {
  type: PieceSymbol;
  color: PieceColor;
  /** Côté de la case, en points. */
  size: number;
  x: number;
  y: number;
  opacity?: number;
}

function PieceGlyph({ type, color, size, x, y, opacity = 1 }: PieceProps) {
  return (
    <Image
      x={x}
      y={y}
      width={size}
      height={size}
      opacity={opacity}
      href={PIECE_IMAGES[color][type]}
      preserveAspectRatio="xMidYMid meet"
      pointerEvents="none"
    />
  );
}

export const Piece = memo(PieceGlyph);
