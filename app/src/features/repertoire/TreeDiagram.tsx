/**
 * Diagramme de l'arbre : noeuds ronds reliés par des courbes, dans l'esprit
 * d'un arbre généalogique — inspiré d'une référence fournie par Romain,
 * adapté aux tons « Atelier ».
 */
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Circle, Path, Text as SvgText } from 'react-native-svg';

import { AppText, Button } from '@/components/ui';
import {
  computeTreeLayout,
  type PositionedNode,
  type TreeEdge,
} from '@/features/repertoire/layout';
import { computeEffectiveStatuses, type FsrsStatus } from '@/features/repertoire/tree';
import { t } from '@/lib/i18n';
import { SHOW_TREE_ZOOM_CONTROLS, useStoredFlag } from '@/lib/settings';
import type { RepertoireNode } from '@/lib/types';
import { Colors, Radius, Spacing } from '@/theme/atelier';

const NODE_R = 22;
const MIN_SCALE = 0.3;
const MAX_SCALE = 1;
const SCALE_STEP = 0.1;

const WHITE_GLYPHS: Record<string, string> = {
  P: '♙',
  N: '♘',
  B: '♗',
  R: '♖',
  Q: '♕',
  K: '♔',
};
const BLACK_GLYPHS: Record<string, string> = {
  P: '♟',
  N: '♞',
  B: '♝',
  R: '♜',
  Q: '♛',
  K: '♚',
};

/** Camp qui joue ce coup : celui au trait sur le FEN d'avant le coup. */
function moverColor(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'b' ? 'black' : 'white';
}

function pieceLetter(san: string): string {
  if (san.startsWith('O-O')) return 'K';
  return 'NBRQK'.includes(san[0]) ? san[0] : 'P';
}

/** Le glyphe remplace la lettre de la pièce : « Nxd4 » s'affiche ♘ + « xd4 ». */
function displayLabel(san: string): string {
  if (san.startsWith('O-O')) return san;
  return 'NBRQK'.includes(san[0]) ? san.slice(1) : san;
}

/**
 * Réponses adverses (popularité renseignée) : ton neutre, comme les ronds
 * blancs de la référence. Nos coups (popularité nulle) : couleur FSRS
 * effective — jamais revu, en retard, ou acquis, en tenant compte des
 * ancêtres (`computeEffectiveStatuses`) pour qu'un coup ne s'affiche jamais
 * acquis juste après un parent non maîtrisé.
 */
function nodeFill(node: RepertoireNode, status: FsrsStatus): string {
  if (node.popularity !== null) return Colors.surface;
  if (status === 'new') return Colors.textMuted;
  return status === 'due' ? Colors.danger : Colors.success;
}

function nodeTextColor(node: RepertoireNode): string {
  return node.popularity !== null ? Colors.text : Colors.accentText;
}

function connectorPath(edge: TreeEdge): string {
  const { from, to } = edge;
  const midY = (from.y + to.y) / 2;
  return (
    `M ${from.x} ${from.y + NODE_R} ` +
    `C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y - NODE_R}`
  );
}

function clampScale(value: number): number {
  'worklet';
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
}

export function TreeDiagram({
  nodes,
  onSelectNode,
}: {
  nodes: RepertoireNode[];
  /** Coup à nous tapé dans l'arbre : permet de rejouer cette carte précise. */
  onSelectNode?: (node: RepertoireNode) => void;
}) {
  const layout = useMemo(() => computeTreeLayout(nodes), [nodes]);
  const statuses = useMemo(() => computeEffectiveStatuses(nodes), [nodes]);
  const [showZoomControls] = useStoredFlag(SHOW_TREE_ZOOM_CONTROLS, true);
  const scale = useSharedValue(1);
  const gestureStartScale = useSharedValue(1);

  // Le pourcentage affiché et l'état désactivé des boutons vivent côté JS ;
  // le zoom lui-même (transform) tourne sur le fil UI pour rester fluide
  // pendant le pincement, sans re-rendre les ~500 noeuds à chaque frame.
  const [displayScale, setDisplayScale] = useState(1);

  const pinch = Gesture.Pinch()
    .onStart(() => {
      gestureStartScale.value = scale.value;
    })
    .onUpdate((event) => {
      scale.value = clampScale(gestureStartScale.value * event.scale);
    })
    .onEnd(() => {
      runOnJS(setDisplayScale)(scale.value);
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const zoomOut = () => {
    const next = clampScale(displayScale - SCALE_STEP);
    scale.value = withTiming(next);
    setDisplayScale(next);
  };
  const zoomIn = () => {
    const next = clampScale(displayScale + SCALE_STEP);
    scale.value = withTiming(next);
    setDisplayScale(next);
  };

  return (
    <View style={styles.container}>
      {showZoomControls ? (
        <View style={styles.zoomBar}>
          <Button
            label="－"
            variant="secondary"
            onPress={zoomOut}
            disabled={displayScale <= MIN_SCALE}
            accessibilityLabel={t('openings.zoomOut')}
            style={styles.zoomButton}
          />
          <AppText muted variant="label" style={styles.zoomValue}>
            {Math.round(displayScale * 100)}%
          </AppText>
          <Button
            label="＋"
            variant="secondary"
            onPress={zoomIn}
            disabled={displayScale >= MAX_SCALE}
            accessibilityLabel={t('openings.zoomIn')}
            style={styles.zoomButton}
          />
        </View>
      ) : null}

      {/* Le zoom ne dépasse jamais 1 (voir MAX_SCALE) : le contenu réduit par
          le transform reste toujours dans les bornes de sa taille native,
          donc les ScrollView n'ont pas besoin de connaître l'échelle
          courante pour calculer une zone de défilement correcte. */}
      <GestureDetector gesture={pinch}>
        <ScrollView horizontal showsHorizontalScrollIndicator style={styles.scroll}>
          <ScrollView showsVerticalScrollIndicator>
            <Animated.View style={[styles.zoomable, animatedStyle]}>
              <Svg width={layout.width} height={layout.height}>
                {layout.edges.map((edge) => (
                  <Path
                    key={`${edge.from.node.id}-${edge.to.node.id}`}
                    d={connectorPath(edge)}
                    stroke={Colors.border}
                    strokeWidth={1.5}
                    fill="none"
                  />
                ))}
                {layout.nodes.map((positioned) => (
                  <TreeNodeShape
                    key={positioned.node.id}
                    positioned={positioned}
                    status={statuses.get(positioned.node.id) ?? 'new'}
                    onPress={onSelectNode}
                  />
                ))}
              </Svg>
            </Animated.View>
          </ScrollView>
        </ScrollView>
      </GestureDetector>
    </View>
  );
}

function TreeNodeShape({
  positioned,
  status,
  onPress,
}: {
  positioned: PositionedNode;
  status: FsrsStatus;
  onPress?: (node: RepertoireNode) => void;
}) {
  const { node, x, y } = positioned;
  const san = node.move_san ?? '';
  const mover = moverColor(node.fen);
  const glyph = (mover === 'white' ? WHITE_GLYPHS : BLACK_GLYPHS)[pieceLetter(san)];
  const label = displayLabel(san);
  const fill = nodeFill(node, status);
  const textColor = nodeTextColor(node);
  const pct = node.popularity === null ? null : `${Math.round(node.popularity * 100)}%`;
  // Carte = un coup à nous : seuls ceux-là ont une échéance FSRS à rejouer.
  const isCard = node.popularity === null;
  // "Maîtrisée" exige les deux : l'échéance FSRS est loin (status) ET la
  // dernière atteinte de cette fin de variante s'est faite d'une traite,
  // sans erreur ni Recommencer (clean, voir RepertoireScreen.tsx).
  const mastered = node.is_book_end && status === 'learned' && node.clean;

  return (
    <>
      <Circle
        cx={x}
        cy={y}
        r={NODE_R}
        fill={fill}
        stroke={Colors.border}
        strokeWidth={1}
        onPress={isCard && onPress ? () => onPress(node) : undefined}
      />
      {pct ? (
        <>
          {/* dy="0.35em" cale la ligne de base au centre : alignmentBaseline
              n'est pas fiable partout dans react-native-svg (Android surtout). */}
          <SvgText
            x={x}
            y={y - 6}
            dy="0.35em"
            fontSize={10}
            fontWeight="700"
            fill={textColor}
            textAnchor="middle">
            {glyph}
            {label}
          </SvgText>
          <SvgText
            x={x}
            y={y + 7}
            dy="0.35em"
            fontSize={8}
            fill={textColor}
            textAnchor="middle"
            opacity={0.85}>
            {pct}
          </SvgText>
        </>
      ) : (
        <SvgText
          x={x}
          y={y}
          dy="0.35em"
          fontSize={10}
          fontWeight="700"
          fill={textColor}
          textAnchor="middle">
          {glyph}
          {label}
        </SvgText>
      )}
      {mastered ? (
        <SvgText
          x={x}
          y={y + NODE_R + 12}
          dy="0.35em"
          fontSize={12}
          fill={Colors.success}
          textAnchor="middle">
          ✓
        </SvgText>
      ) : null}
    </>
  );
}

/** Explique les couleurs des ronds : sans elle, le code FSRS n'est pas lisible. */
export function TreeLegend() {
  const items: { color: string; label: string; outline?: boolean }[] = [
    { color: Colors.surface, label: t('openings.legendOpponent'), outline: true },
    { color: Colors.textMuted, label: t('openings.legendNew') },
    { color: Colors.danger, label: t('openings.legendDue') },
    { color: Colors.success, label: t('openings.legendLearned') },
  ];
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.legend}
      contentContainerStyle={styles.legendContent}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View
            style={[
              styles.legendDot,
              { backgroundColor: item.color },
              item.outline && styles.legendDotOutline,
            ]}
          />
          <AppText muted style={styles.legendLabel}>
            {item.label}
          </AppText>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  zoomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: Spacing.sm,
    marginBottom: Spacing.sm,
  },
  zoomButton: {
    paddingVertical: Spacing.xs,
    paddingHorizontal: Spacing.md,
  },
  zoomValue: {
    minWidth: 40,
    textAlign: 'center',
  },
  scroll: {
    flex: 1,
  },
  zoomable: {
    transformOrigin: 'top left',
  },
  legend: {
    // ScrollView grandit par défaut (flexGrow:1, contrairement à View) : sans
    // ce blocage, elle se dispute l'espace vertical avec l'arbre et prend la
    // moitié de l'écran à elle seule.
    flexGrow: 0,
    flexShrink: 0,
    flexDirection: 'row',
    marginBottom: Spacing.xs,
  },
  // flexGrow:1 ici seulement (le contenu défilable, pas la ScrollView
  // elle-même) : centre la légende si elle tient, scrolle sinon.
  legendContent: {
    flexGrow: 1,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 3,
    marginRight: Spacing.sm,
  },
  legendDot: {
    width: 7,
    height: 7,
    borderRadius: Radius.sm,
  },
  legendLabel: {
    fontSize: 10,
  },
  legendDotOutline: {
    borderWidth: 1,
    borderColor: Colors.border,
  },
});
