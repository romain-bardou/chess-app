/**
 * Échiquier maison : react-native-svg pour le rendu, gesture-handler +
 * reanimated pour la manipulation, chess.js pour la légalité des coups.
 *
 * Le composant est contrôlé : il ne joue jamais de coup lui-même, il remonte
 * l'intention via `onMove` et attend un nouveau `fen`.
 *
 * Deux façons de jouer : appui sur la pièce puis sur la case, ou glisser-déposer.
 */
import { Chess, type Color, type PieceSymbol, type Square } from 'chess.js';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
} from 'react';
import { StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  LinearGradient,
  Rect,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

import { Piece } from '@/chess/Pieces';
import {
  ALL_SQUARES,
  FILES,
  isLightSquare,
  pointToSquare,
  squareToPoint,
} from '@/chess/squares';
import { Board, Colors, Radius } from '@/theme/atelier';

/** Déplacement au-delà duquel le geste est un glisser et non un appui. */
const TAP_SLOP = 8;

const PROMOTION_CHOICES: PieceSymbol[] = ['q', 'r', 'b', 'n'];

export interface BoardMove {
  from: Square;
  to: Square;
  promotion?: PieceSymbol;
  san: string;
}

interface ChessboardProps {
  fen: string;
  /** Camp affiché en bas. */
  orientation: Color;
  /** Côté de l'échiquier, en points. */
  size: number;
  interactive?: boolean;
  lastMove?: { from: Square; to: Square } | null;
  onMove?: (move: BoardMove) => void;
}

/**
 * Extrémités du dégradé de case, dérivées de l'angle de la charte et exprimées
 * dans le repère normalisé de la case.
 */
function gradientEnds(angleDegrees: number) {
  const angle = (angleDegrees * Math.PI) / 180;
  const dx = Math.sin(angle);
  const dy = -Math.cos(angle);
  const half = (Math.abs(dx) + Math.abs(dy)) / 2;
  return {
    x1: 0.5 - dx * half,
    y1: 0.5 - dy * half,
    x2: 0.5 + dx * half,
    y2: 0.5 + dy * half,
  };
}

const ENDS = gradientEnds(Board.gradientAngle);

export function Chessboard({
  fen,
  orientation,
  size,
  interactive = false,
  lastMove = null,
  onMove,
}: ChessboardProps) {
  const squareSize = size / 8;
  const game = useMemo(() => new Chess(fen), [fen]);

  const [selected, setSelected] = useState<Square | null>(null);
  const [dragFrom, setDragFrom] = useState<Square | null>(null);
  const [promotion, setPromotion] = useState<{ from: Square; to: Square } | null>(
    null
  );

  // L'objet `Gesture` est mémoïsé ; ses callbacks passent par une ref pour
  // toujours voir l'état du dernier rendu plutôt qu'une capture périmée.
  const selectedRef = useRef<Square | null>(null);
  const dragFromRef = useRef<Square | null>(null);

  useEffect(() => {
    selectedRef.current = null;
    dragFromRef.current = null;
    setSelected(null);
    setDragFrom(null);
    setPromotion(null);
  }, [fen]);

  const setActiveSquare = useCallback((square: Square | null) => {
    selectedRef.current = square;
    setSelected(square);
  }, []);

  const setDragSquare = useCallback((square: Square | null) => {
    dragFromRef.current = square;
    setDragFrom(square);
  }, []);

  /** Tente le coup ; ouvre le choix de promotion si la case l'exige. */
  const submit = useCallback(
    (from: Square, to: Square, promoteTo?: PieceSymbol): boolean => {
      const options = game
        .moves({ square: from, verbose: true })
        .filter((move) => move.to === to);
      if (options.length === 0) return false;

      if (options.some((move) => move.promotion) && !promoteTo) {
        setPromotion({ from, to });
        return true;
      }

      const chosen = promoteTo
        ? options.find((move) => move.promotion === promoteTo)
        : options[0];
      if (!chosen) return false;

      setActiveSquare(null);
      setPromotion(null);
      onMove?.({
        from: chosen.from,
        to: chosen.to,
        promotion: chosen.promotion,
        san: chosen.san,
      });
      return true;
    },
    [game, onMove, setActiveSquare]
  );

  const handleTouchStart = useCallback(
    (x: number, y: number) => {
      const square = pointToSquare(x, y, orientation, squareSize);
      if (!square) return;
      const piece = game.get(square);
      if (piece && piece.color === game.turn()) setDragSquare(square);
    },
    [game, orientation, squareSize, setDragSquare]
  );

  const handleTouchEnd = useCallback(
    (x: number, y: number, moved: boolean) => {
      const square = pointToSquare(x, y, orientation, squareSize);
      const from = dragFromRef.current;
      setDragSquare(null);
      if (!square) return;

      if (moved) {
        if (from && from !== square) submit(from, square);
        return;
      }

      const previous = selectedRef.current;
      if (previous && previous !== square && submit(previous, square)) return;

      const piece = game.get(square);
      const selectable =
        piece && piece.color === game.turn() && previous !== square;
      setActiveSquare(selectable ? square : null);
    },
    [game, orientation, squareSize, setActiveSquare, setDragSquare, submit]
  );

  // Trampolines stables : `runOnJS` doit recevoir une référence constante,
  // alors que les handlers changent à chaque rendu.
  const handlers = useRef({ start: handleTouchStart, end: handleTouchEnd });
  handlers.current = { start: handleTouchStart, end: handleTouchEnd };

  const touchStart = useCallback(
    (x: number, y: number) => handlers.current.start(x, y),
    []
  );
  const touchEnd = useCallback(
    (x: number, y: number, moved: boolean) => handlers.current.end(x, y, moved),
    []
  );

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(0);

  const gesture = useMemo(
    () =>
      Gesture.Pan()
        .enabled(interactive)
        .minDistance(0)
        .onBegin((event) => {
          startX.value = event.x;
          startY.value = event.y;
          dragX.value = event.x;
          dragY.value = event.y;
          runOnJS(touchStart)(event.x, event.y);
        })
        .onUpdate((event) => {
          dragX.value = event.x;
          dragY.value = event.y;
          const distance = Math.hypot(
            event.x - startX.value,
            event.y - startY.value
          );
          dragging.value = distance > TAP_SLOP ? 1 : 0;
        })
        .onEnd((event) => {
          const distance = Math.hypot(
            event.x - startX.value,
            event.y - startY.value
          );
          runOnJS(touchEnd)(event.x, event.y, distance > TAP_SLOP);
        })
        .onFinalize(() => {
          dragging.value = 0;
        }),
    [interactive, touchStart, touchEnd, dragX, dragY, startX, startY, dragging]
  );

  const active = dragFrom ?? selected;

  /** Destinations légales depuis la case active : `true` si c'est une capture. */
  const targets = useMemo(() => {
    const map = new Map<Square, boolean>();
    if (!active || !interactive) return map;
    for (const move of game.moves({ square: active, verbose: true })) {
      map.set(move.to, move.isCapture());
    }
    return map;
  }, [game, active, interactive]);

  const draggedPiece = dragFrom ? game.get(dragFrom) : undefined;
  const dragStyle = useAnimatedStyle(() => ({
    opacity: dragging.value,
    transform: [
      { translateX: dragX.value - squareSize / 2 },
      // La pièce se place au-dessus du doigt pour rester visible.
      { translateY: dragY.value - squareSize * 0.75 },
    ],
  }));

  const activePoint = active
    ? squareToPoint(active, orientation, squareSize)
    : null;

  return (
    <View style={{ width: size, height: size }}>
      <GestureDetector gesture={gesture}>
        <View style={[styles.board, { width: size, height: size }]}>
          <Svg width={size} height={size}>
            <Defs>
              <LinearGradient id="lightSquare" {...ENDS}>
                <Stop offset="0" stopColor={Board.light.from} />
                <Stop offset="1" stopColor={Board.light.to} />
              </LinearGradient>
              <LinearGradient id="darkSquare" {...ENDS}>
                <Stop offset="0" stopColor={Board.dark.from} />
                <Stop offset="1" stopColor={Board.dark.to} />
              </LinearGradient>
            </Defs>

            {ALL_SQUARES.map((square) => {
              const { x, y } = squareToPoint(square, orientation, squareSize);
              return (
                <Rect
                  key={square}
                  x={x}
                  y={y}
                  width={squareSize}
                  height={squareSize}
                  fill={isLightSquare(square) ? 'url(#lightSquare)' : 'url(#darkSquare)'}
                />
              );
            })}

            {lastMove
              ? [lastMove.from, lastMove.to].map((square) => {
                  const { x, y } = squareToPoint(square, orientation, squareSize);
                  return (
                    <Rect
                      key={`last-${square}`}
                      x={x}
                      y={y}
                      width={squareSize}
                      height={squareSize}
                      fill={Colors.lastMove}
                    />
                  );
                })
              : null}

            {activePoint ? (
              <Rect
                x={activePoint.x}
                y={activePoint.y}
                width={squareSize}
                height={squareSize}
                fill={Colors.selected}
              />
            ) : null}

            {[...targets.entries()].map(([square, isCapture]) => {
              const { x, y } = squareToPoint(square, orientation, squareSize);
              const cx = x + squareSize / 2;
              const cy = y + squareSize / 2;
              return isCapture ? (
                <Circle
                  key={`target-${square}`}
                  cx={cx}
                  cy={cy}
                  r={squareSize * 0.42}
                  fill="none"
                  stroke={Colors.legal}
                  strokeWidth={squareSize * 0.09}
                />
              ) : (
                <Circle
                  key={`target-${square}`}
                  cx={cx}
                  cy={cy}
                  r={squareSize * 0.16}
                  fill={Colors.legal}
                />
              );
            })}

            {game
              .board()
              .flat()
              .map((cell) => {
                if (!cell) return null;
                const { x, y } = squareToPoint(
                  cell.square,
                  orientation,
                  squareSize
                );
                return (
                  <Piece
                    key={cell.square}
                    type={cell.type}
                    color={cell.color}
                    size={squareSize}
                    x={x}
                    y={y}
                    opacity={cell.square === dragFrom ? 0.35 : 1}
                  />
                );
              })}

            <Coordinates orientation={orientation} squareSize={squareSize} />
          </Svg>
        </View>
      </GestureDetector>

      {draggedPiece ? (
        <Animated.View pointerEvents="none" style={[styles.dragLayer, dragStyle]}>
          <Svg width={squareSize} height={squareSize}>
            <Piece
              type={draggedPiece.type}
              color={draggedPiece.color}
              size={squareSize}
              x={0}
              y={0}
            />
          </Svg>
        </Animated.View>
      ) : null}

      {promotion ? (
        <PromotionPicker
          color={game.turn()}
          squareSize={squareSize}
          boardSize={size}
          onPick={(piece) => submit(promotion.from, promotion.to, piece)}
          onCancel={() => setPromotion(null)}
        />
      ) : null}
    </View>
  );
}

function Coordinates({
  orientation,
  squareSize,
}: {
  orientation: Color;
  squareSize: number;
}) {
  const fontSize = Math.max(9, squareSize * 0.2);
  const labels: ReactElement[] = [];

  for (let index = 0; index < 8; index += 1) {
    const file = orientation === 'w' ? index : 7 - index;
    const rank = orientation === 'w' ? 7 - index : index;
    const bottomSquare = `${FILES[file]}${orientation === 'w' ? 1 : 8}` as Square;
    const leftSquare = `${FILES[orientation === 'w' ? 0 : 7]}${rank + 1}` as Square;

    labels.push(
      <SvgText
        key={`file-${index}`}
        x={index * squareSize + squareSize - fontSize * 0.4}
        y={8 * squareSize - fontSize * 0.4}
        fontSize={fontSize}
        fontWeight="600"
        textAnchor="end"
        opacity={0.55}
        fill={isLightSquare(bottomSquare) ? Board.dark.to : Board.light.from}>
        {FILES[file]}
      </SvgText>,
      <SvgText
        key={`rank-${index}`}
        x={fontSize * 0.4}
        y={index * squareSize + fontSize * 1.1}
        fontSize={fontSize}
        fontWeight="600"
        opacity={0.55}
        fill={isLightSquare(leftSquare) ? Board.dark.to : Board.light.from}>
        {orientation === 'w' ? 8 - index : index + 1}
      </SvgText>
    );
  }

  return <>{labels}</>;
}

function PromotionPicker({
  color,
  squareSize,
  boardSize,
  onPick,
  onCancel,
}: {
  color: Color;
  squareSize: number;
  boardSize: number;
  onPick: (piece: PieceSymbol) => void;
  onCancel: () => void;
}) {
  return (
    <View
      style={[styles.promotionOverlay, { width: boardSize, height: boardSize }]}
      onStartShouldSetResponder={() => true}
      onResponderRelease={onCancel}>
      <View style={styles.promotionRow}>
        {PROMOTION_CHOICES.map((piece) => (
          <View
            key={piece}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => onPick(piece)}>
            <Svg width={squareSize} height={squareSize}>
              <Piece type={piece} color={color} size={squareSize} x={0} y={0} />
            </Svg>
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  board: {
    borderRadius: Radius.sm,
    overflow: 'hidden',
  },
  dragLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
  },
  promotionOverlay: {
    position: 'absolute',
    left: 0,
    top: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 36, 18, 0.55)',
  },
  promotionRow: {
    flexDirection: 'row',
    padding: 6,
    borderRadius: Radius.md,
    backgroundColor: Colors.surface,
  },
});
