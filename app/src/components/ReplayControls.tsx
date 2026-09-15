/** Flèches de défilement d'une variante, coup par coup — partagé puzzles/ouvertures. */
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

import type { LineReplay } from '@/features/review/useLineReplay';
import { t } from '@/lib/i18n';
import { Colors, Radius, Spacing } from '@/theme/atelier';
import { AppText } from '@/components/ui';

export function ReplayControls({ replay }: { replay: LineReplay }) {
  if (replay.total <= 0) return null;
  return (
    <View style={styles.replayControls}>
      <StepButton
        direction="back"
        accessibilityLabel={t('review.stepBack')}
        disabled={replay.atStart}
        onPress={replay.previous}
      />
      <AppText muted variant="label">
        {t('review.step', { step: replay.step, total: replay.total })}
      </AppText>
      <StepButton
        direction="forward"
        accessibilityLabel={t('review.stepForward')}
        disabled={replay.atEnd}
        onPress={replay.next}
      />
    </View>
  );
}

/** Chevron dessiné en trait, plutôt qu'un glyphe Unicode ◀ / ▶. */
function StepButton({
  direction,
  disabled = false,
  accessibilityLabel,
  onPress,
}: {
  direction: 'back' | 'forward';
  disabled?: boolean;
  accessibilityLabel: string;
  onPress: () => void;
}) {
  const d = direction === 'back' ? 'M12 5L7 11L12 17' : 'M8 5L13 11L8 17';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.stepButton,
        (pressed || disabled) && styles.stepButtonDimmed,
      ]}>
      <Svg width={22} height={22} viewBox="0 0 22 22">
        <Path
          d={d}
          stroke={Colors.accent}
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      </Svg>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  replayControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: Spacing.sm,
    columnGap: Spacing.sm,
  },
  stepButton: {
    width: 44,
    height: 44,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepButtonDimmed: {
    opacity: 0.6,
  },
});
