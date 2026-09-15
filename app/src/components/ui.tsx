/** Primitives visuelles partagées, alignées sur la charte « Atelier ». */
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { t } from '@/lib/i18n';
import { Colors, Radius, Spacing, Typography } from '@/theme/atelier';

export function Screen({
  children,
  scroll = false,
  style,
}: {
  children: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.scrollContent, style]}
      showsVerticalScrollIndicator={false}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, style]}>{children}</View>
  );
  return <SafeAreaView style={styles.screen}>{content}</SafeAreaView>;
}

type TextVariant = keyof typeof Typography;

export function AppText({
  children,
  variant = 'body',
  muted = false,
  color,
  style,
  numberOfLines,
}: {
  children: ReactNode;
  variant?: TextVariant;
  muted?: boolean;
  color?: string;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[
        Typography[variant] as TextStyle,
        { color: color ?? (muted ? Colors.textMuted : Colors.text) },
        style,
      ]}>
      {children}
    </Text>
  );
}

export function Panel({
  children,
  style,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[styles.panel, style]}>{children}</View>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityLabel,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  /** À renseigner quand le libellé est un symbole (flèches de variante). */
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        (pressed || disabled) && styles.buttonDimmed,
        style,
      ]}>
      <Text
        style={[
          Typography.label as TextStyle,
          { color: primary ? Colors.accentText : Colors.accent },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Réglage booléen : un libellé et son interrupteur, sur une ligne. */
export function Toggle({
  label,
  value,
  onValueChange,
}: {
  label: string;
  value: boolean;
  onValueChange: (value: boolean) => void;
}) {
  return (
    <View style={styles.toggle}>
      <AppText muted variant="label" style={styles.toggleLabel}>
        {label}
      </AppText>
      <Switch
        value={value}
        onValueChange={onValueChange}
        accessibilityLabel={label}
        trackColor={{ false: Colors.border, true: Colors.accent }}
        thumbColor={Colors.surface}
      />
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
  style,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && styles.buttonDimmed,
        style,
      ]}>
      <Text
        style={[
          Typography.label as TextStyle,
          { color: selected ? Colors.accentText : Colors.textMuted },
        ]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function Loader({ label }: { label?: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={Colors.accent} />
      {label ? (
        <AppText muted style={{ marginTop: Spacing.sm }}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

/** Menu déroulant : ligne libellé/valeur, choix dans une feuille au tap. */
export function Select<T extends string>({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  style,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  /** N'affiche que la valeur (le libellé reste lu par les lecteurs d'écran
   * et sert de titre à la feuille de choix). */
  hideLabel?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const [open, setOpen] = useState(false);
  const current = options.find((option) => option.value === value)?.label ?? '';

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label} : ${current}`}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.selectRow,
          pressed && styles.buttonDimmed,
          style,
        ]}>
        {!hideLabel ? <AppText>{label}</AppText> : null}
        <AppText muted variant="label">
          {current}
        </AppText>
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}>
        <Pressable
          style={styles.selectBackdrop}
          accessibilityRole="button"
          accessibilityLabel={t('common.cancel')}
          onPress={() => setOpen(false)}>
          <Pressable style={styles.selectSheet} onPress={(event) => event.stopPropagation()}>
            <AppText variant="heading" style={styles.selectSheetTitle}>
              {label}
            </AppText>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.selectOption,
                    pressed && styles.buttonDimmed,
                  ]}>
                  <AppText color={selected ? Colors.accent : undefined}>
                    {option.label}
                  </AppText>
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.centered}>
      <AppText variant="heading">{title}</AppText>
      <AppText muted style={styles.emptyBody}>
        {body}
      </AppText>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  screenContent: {
    flex: 1,
    paddingHorizontal: Spacing.md,
  },
  scrollContent: {
    paddingHorizontal: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  panel: {
    backgroundColor: Colors.surface,
    borderRadius: Radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: Colors.border,
    padding: Spacing.md,
  },
  button: {
    paddingVertical: Spacing.sm + 4,
    paddingHorizontal: Spacing.lg,
    borderRadius: Radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonPrimary: {
    backgroundColor: Colors.accent,
  },
  buttonSecondary: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: Colors.accent,
  },
  buttonDimmed: {
    opacity: 0.6,
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    columnGap: Spacing.sm,
  },
  toggleLabel: {
    flexShrink: 1,
  },
  chip: {
    paddingVertical: Spacing.xs + 2,
    paddingHorizontal: Spacing.sm + 4,
    borderRadius: Radius.lg,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.surface,
    marginRight: Spacing.sm,
    alignItems: 'center',
  },
  chipSelected: {
    backgroundColor: Colors.accent,
    borderColor: Colors.accent,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.lg,
  },
  emptyBody: {
    marginTop: Spacing.sm,
    marginBottom: Spacing.md,
    textAlign: 'center',
  },
  selectRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  selectBackdrop: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(59, 36, 18, 0.55)',
  },
  selectSheet: {
    backgroundColor: Colors.surface,
    borderTopLeftRadius: Radius.lg,
    borderTopRightRadius: Radius.lg,
    paddingHorizontal: Spacing.md,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
  },
  selectSheetTitle: {
    marginBottom: Spacing.sm,
  },
  selectOption: {
    paddingVertical: Spacing.sm + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
  },
});
