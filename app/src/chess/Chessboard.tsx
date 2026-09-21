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
  memo,
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
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle,
  Defs,
  Line,
  LinearGradient,
  Polygon,
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
import { pieceTravels, type PieceTravel } from '@/chess/transitions';
import { playMoveSound } from '@/lib/sound';
import { Board, Colors, Radius } from '@/theme/atelier';

/** Déplacement au-delà duquel le geste est un glisser et non un appui. */
const TAP_SLOP = 8;

/** Durée du trajet d'une pièce d'une case à l'autre, en millisecondes. */
export const MOVE_DURATION_MS = 190;

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
  /** Coup à suggérer par une flèche, quand le joueur vient de se tromper. */
  hintArrow?: { from: Square; to: Square } | null;
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

/**
 * Mémoïsé : l'écran de révision rerend chaque seconde (chrono) et à chaque
 * interaction hors échiquier (filtre, toggle) — sans ça, tout l'arbre SVG
 * (64 cases, dégradés, gestes) se reconstruirait pour rien à chaque fois.
 */
export const Chessboard = memo(function Chessboard({
  fen,
  orientation,
  size,
  interactive = false,
  lastMove = null,
  hintArrow = null,
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

  // Trajet des pièces entre l'ancienne et la nouvelle position. L'échiquier
  // affiche déjà la position d'arrivée : les pièces en vol sont masquées sur
  // leur case de destination et redessinées dans la couche animée.
  const [travels, setTravels] = useState<PieceTravel[]>([]);
  const travelProgress = useSharedValue(1);
  const renderedFen = useRef(fen);

  // Calculé pendant le rendu (motif React « ajuster l'état pendant le
  // rendu »), pas dans un effet : un effet tourne une frame après la
  // position déjà affichée avec la nouvelle FEN, donc la pièce arrivée se
  // montrerait d'abord au grand jour avant que l'effet la masque pour la
  // couche animée — un flash suivi d'une disparition/réapparition à chaque
  // coup. Calculer ici applique le masquage dès la première peinture de
  // cette position.
  if (fen !== renderedFen.current) {
    const before = renderedFen.current;
    renderedFen.current = fen;
    // Liste vide : ce n'est pas un coup (nouvelle carte, retour en arrière).
    // On bascule sans transition plutôt que d'inventer un déplacement.
    setTravels(pieceTravels(before, fen));
  }

  // L'animation elle-même (son, trajet UI-thread) reste dans un effet : ce
  // sont de vrais effets de bord, sans rapport avec ce qui doit être masqué
  // à l'écran dès ce rendu.
  useEffect(() => {
    if (travels.length === 0) return;
    playMoveSound();
    travelProgress.value = 0;
    travelProgress.value = withTiming(
      1,
      { duration: MOVE_DURATION_MS, easing: Easing.out(Easing.quad) },
      (finished) => {
        if (finished) runOnJS(setTravels)([]);
      }
    );
  }, [travels, travelProgress]);

  const flying = useMemo(
    () => new Set(travels.map((travel) => travel.to)),
    [travels]
  );

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

  /** Fin d'un glisser : la pièce est lâchée sur la case sous le doigt. */
  const handleDrop = useCallback(
    (x: number, y: number) => {
      const square = pointToSquare(x, y, orientation, squareSize);
      const from = dragFromRef.current;
      setDragSquare(null);
      if (square && from && from !== square) submit(from, square);
    },
    [orientation, squareSize, setDragSquare, submit]
  );

  /**
   * Appui simple : on sélectionne sa pièce, puis on désigne la destination.
   * Le deuxième appui joue le coup si la case est une destination légale,
   * sinon il change la sélection.
   */
  const handleTap = useCallback(
    (x: number, y: number) => {
      const square = pointToSquare(x, y, orientation, squareSize);
      setDragSquare(null);
      if (!square) return;

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
  const handlers = useRef({
    start: handleTouchStart,
    drop: handleDrop,
    tap: handleTap,
  });
  handlers.current = {
    start: handleTouchStart,
    drop: handleDrop,
    tap: handleTap,
  };

  const touchStart = useCallback(
    (x: number, y: number) => handlers.current.start(x, y),
    []
  );
  const touchDrop = useCallback(
    (x: number, y: number) => handlers.current.drop(x, y),
    []
  );
  const touchTap = useCallback(
    (x: number, y: number) => handlers.current.tap(x, y),
    []
  );
  const cancelDrag = useCallback(() => setDragSquare(null), [setDragSquare]);

  const dragX = useSharedValue(0);
  const dragY = useSharedValue(0);
  const startX = useSharedValue(0);
  const startY = useSharedValue(0);
  const dragging = useSharedValue(0);

  // Le glisser passe par un Pan, l'appui par un Tap : un Pan qui ne s'active
  // jamais (doigt posé puis relevé sans bouger) n'appelle pas `onEnd`, donc
  // lui confier aussi l'appui laisserait le clic-clic sans effet.
  const pan = useMemo(
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
          if (distance > TAP_SLOP) runOnJS(touchDrop)(event.x, event.y);
          else runOnJS(touchTap)(event.x, event.y);
        })
        .onFinalize(() => {
          dragging.value = 0;
          runOnJS(cancelDrag)();
        }),
    [
      interactive,
      touchStart,
      touchDrop,
      touchTap,
      cancelDrag,
      dragX,
      dragY,
      startX,
      startY,
      dragging,
    ]
  );

  const tap = useMemo(
    () =>
      Gesture.Tap()
        .enabled(interactive)
        .maxDistance(TAP_SLOP)
        // Un appui réfléchi peut durer : la durée par défaut (500 ms) le
        // ferait échouer sans que rien ne se passe à l'écran.
        .maxDuration(4000)
        .onEnd((event) => {
          runOnJS(touchTap)(event.x, event.y);
        }),
    [interactive, touchTap]
  );

  // Le Pan est prioritaire : s'il s'active, c'est un glisser et le Tap est
  // annulé. Sinon le Tap reprend la main.
  const gesture = useMemo(() => Gesture.Exclusive(pan, tap), [pan, tap]);

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
          </Svg>

          {/* Calque à part, en `Image` RN plutôt que dans le `Svg` : voir
              Pieces.tsx — le rendu SVG redécodait le bitmap à chaque
              montage. */}
          <View style={styles.pieceLayer} pointerEvents="none">
            {game
              .board()
              .flat()
              .map((cell) => {
                if (!cell || flying.has(cell.square)) return null;
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
          </View>

          {/* Repères a-h/1-8 par-dessus les pièces, comme avant ce calque. */}
          <Svg
            width={size}
            height={size}
            style={styles.pieceLayer}
            pointerEvents="none">
            {hintArrow ? (
              <HintArrow
                from={hintArrow.from}
                to={hintArrow.to}
                orientation={orientation}
                squareSize={squareSize}
              />
            ) : null}
            <Coordinates orientation={orientation} squareSize={squareSize} />
          </Svg>
        </View>
      </GestureDetector>

      {travels.map((travel) => (
        <TravelingPiece
          key={`${travel.from}-${travel.to}`}
          travel={travel}
          orientation={orientation}
          squareSize={squareSize}
          progress={travelProgress}
        />
      ))}

      {draggedPiece ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.dragLayer,
            { width: squareSize, height: squareSize },
            dragStyle,
          ]}>
          <Piece
            type={draggedPiece.type}
            color={draggedPiece.color}
            size={squareSize}
            x={0}
            y={0}
          />
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
});

/**
 * Pièce en cours de déplacement, dessinée au-dessus de l'échiquier.
 *
 * Les deux extrémités sont fixes : seule la progression est animée, ce qui
 * garde tout le trajet sur le thread d'animation.
 */
function TravelingPiece({
  travel,
  orientation,
  squareSize,
  progress,
}: {
  travel: PieceTravel;
  orientation: Color;
  squareSize: number;
  progress: SharedValue<number>;
}) {
  const from = squareToPoint(travel.from, orientation, squareSize);
  const to = squareToPoint(travel.to, orientation, squareSize);

  const style = useAnimatedStyle(() => ({
    transform: [
      { translateX: from.x + (to.x - from.x) * progress.value },
      { translateY: from.y + (to.y - from.y) * progress.value },
    ],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.dragLayer, { width: squareSize, height: squareSize }, style]}>
      <Piece type={travel.type} color={travel.color} size={squareSize} x={0} y={0} />
    </Animated.View>
  );
}

/** Flèche pleine et translucide, centre à centre, pointant vers la case attendue. */
function HintArrow({
  from,
  to,
  orientation,
  squareSize,
}: {
  from: Square;
  to: Square;
  orientation: Color;
  squareSize: number;
}) {
  const start = squareToPoint(from, orientation, squareSize);
  const end = squareToPoint(to, orientation, squareSize);
  const x1 = start.x + squareSize / 2;
  const y1 = start.y + squareSize / 2;
  const x2 = end.x + squareSize / 2;
  const y2 = end.y + squareSize / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  if (length < 1) return null;

  const angle = Math.atan2(dy, dx);
  const headLength = squareSize * 0.38;
  const headWidth = squareSize * 0.32;
  // Le trait s'arrête au pied de la pointe, sinon il déborde dessous.
  const shaftEndX = x2 - Math.cos(angle) * headLength;
  const shaftEndY = y2 - Math.sin(angle) * headLength;
  const leftX = shaftEndX + Math.cos(angle + Math.PI / 2) * (headWidth / 2);
  const leftY = shaftEndY + Math.sin(angle + Math.PI / 2) * (headWidth / 2);
  const rightX = shaftEndX + Math.cos(angle - Math.PI / 2) * (headWidth / 2);
  const rightY = shaftEndY + Math.sin(angle - Math.PI / 2) * (headWidth / 2);

  return (
    <>
      <Line
        x1={x1}
        y1={y1}
        x2={shaftEndX}
        y2={shaftEndY}
        stroke={Colors.hintArrow}
        strokeWidth={squareSize * 0.16}
        strokeLinecap="round"
      />
      <Polygon
        points={`${x2},${y2} ${leftX},${leftY} ${rightX},${rightY}`}
        fill={Colors.hintArrow}
      />
    </>
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
            style={{ width: squareSize, height: squareSize }}
            onStartShouldSetResponder={() => true}
            onResponderRelease={() => onPick(piece)}>
            <Piece type={piece} color={color} size={squareSize} x={0} y={0} />
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
  pieceLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  dragLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Android masque par défaut ce qui dépasse d'une View sans taille
    // propre ; explicite ici pour ne pas dépendre de ce défaut.
    overflow: 'visible',
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
