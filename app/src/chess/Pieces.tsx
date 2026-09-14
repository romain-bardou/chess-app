/**
 * Silhouettes de pièces : jeu « ocean » (chess.com), en PNG.
 *
 * Jeu d'origine non libre — l'app n'étant pas destinée à l'App Store, la
 * contrainte de licence qui écartait Cburnett & co. ne s'applique plus ici.
 *
 * `Image` d'`expo-image`, pas celui de `react-native` : ce dernier charge
 * les images simultanées (32 pièces au premier affichage) par petits
 * groupes plutôt que toutes d'un coup, d'où l'apparition par vagues et le
 * clignotement à chaque coup. `expo-image` passe par un cache disque+mémoire
 * (SDWebImage/Glide) qui ne marque pas ce genre de goulot.
 */
import { Asset } from 'expo-asset';
import { Image } from 'expo-image';
import { memo } from 'react';

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

/** Toutes les pièces d'un coup : réchauffe le cache d'`expo-image` avant le
 * premier affichage de l'échiquier, pour que le montage d'une pièce ne soit
 * jamais le premier chargement de son image. */
export function preloadPieceImages(): void {
  const sources = Object.values(PIECE_IMAGES).flatMap((byType) =>
    Object.values(byType)
  );
  Image.prefetch(sources.map((source) => Asset.fromModule(source).uri));
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

function PieceGlyph({ type, color, size, x, y, opacity = 1 }: PieceProps) {
  return (
    <Image
      source={PIECE_IMAGES[color][type]}
      contentFit="contain"
      cachePolicy="memory-disk"
      style={{ position: 'absolute', left: x, top: y, width: size, height: size, opacity }}
    />
  );
}

export const Piece = memo(PieceGlyph);
