// The handful of building blocks every screen uses. Keeping them here means
// screens describe *what* to show, and the look (tokens) lives in one place.

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isRTL } from '@/i18n';
import { useT } from '@/lib/session';
import { colors, fonts, radii, sizes, space } from '@/theme/tokens';

function useFont() {
  const { lang } = useT();
  return { f: fonts[lang], direction: isRTL(lang) ? ('rtl' as const) : ('ltr' as const) };
}

/** Full-screen page: safe area, porcelain background, content on top, actions at the bottom. */
export function Screen({
  children,
  footer,
  scroll,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
}) {
  const { direction } = useFont();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={[styles.flex, { direction }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        ) : (
          <View style={styles.content}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

export function Title({ children }: { children: ReactNode }) {
  const { f } = useFont();
  return <Text style={[styles.title, { fontFamily: f.bold }]}>{children}</Text>;
}

export function Body({ children, muted, error }: { children: ReactNode; muted?: boolean; error?: boolean }) {
  const { f } = useFont();
  return (
    <Text
      style={[
        styles.body,
        { fontFamily: f.regular },
        muted && { color: colors.inkSecondary },
        error && { color: colors.statusClosed },
      ]}
    >
      {children}
    </Text>
  );
}

/** Graphite capsule button. Primary action of a screen. */
export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'plain';
}) {
  const { f } = useFont();
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonPlain,
        (disabled || loading) && { opacity: 0.4 },
        pressed && { opacity: 0.8 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={primary ? colors.onInk : colors.ink} />
      ) : (
        <Text style={[styles.buttonText, { fontFamily: f.medium, color: primary ? colors.onInk : colors.ink }]}>
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/** Text field with a hairline underline, no box. */
export function Field(props: TextInputProps & { ltr?: boolean }) {
  const { f, direction } = useFont();
  const { ltr, style, ...rest } = props;
  return (
    <TextInput
      placeholderTextColor={colors.inkSecondary}
      {...rest}
      style={[
        styles.field,
        { fontFamily: ltr ? fonts.en.regular : f.regular },
        // Phone numbers and codes read left to right even in Arabic.
        { textAlign: ltr ? 'left' : direction === 'rtl' ? 'right' : 'left', writingDirection: ltr ? 'ltr' : direction },
        style,
      ]}
    />
  );
}

/** Two-option segmented choice (e.g. male / female). */
export function Choice<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  onChange: (v: T) => void;
}) {
  const { f } = useFont();
  return (
    <View style={styles.choiceRow}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.choice, selected && styles.choiceSelected]}
          >
            <Text style={[styles.choiceText, { fontFamily: f.medium }, selected && { color: colors.onInk }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Small uppercase-ish label above a form control. */
export function Label({ children }: { children: ReactNode }) {
  const { f } = useFont();
  return <Text style={[styles.label, { fontFamily: f.medium }]}>{children}</Text>;
}

/** A row of capsule chips that scrolls sideways when it doesn't fit (e.g. days). */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  const { f } = useFont();
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={String(o.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.chip, selected && styles.choiceSelected]}
          >
            <Text style={[styles.choiceText, { fontFamily: f.medium }, selected && { color: colors.onInk }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** − 3 + control for small whole numbers. */
export function Stepper({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (n: number) => void;
}) {
  const btn = (label: string, next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === '+' ? 'increase' : 'decrease'}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={[styles.stepBtn, disabled && { opacity: 0.3 }]}
    >
      <Text style={[styles.stepText, { fontFamily: fonts.en.medium }]}>{label}</Text>
    </Pressable>
  );
  // Steppers keep − on the left and + on the right in both languages, like a number line.
  return (
    <View style={[styles.stepper, { direction: 'ltr' }]}>
      {btn('−', value - 1, value <= min)}
      <Text style={[styles.stepValue, { fontFamily: fonts.en.bold }]}>{value}</Text>
      {btn('+', value + 1, value >= max)}
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { flexGrow: 1, paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.md },
  footer: { paddingHorizontal: space.lg, paddingBottom: space.md, gap: space.sm },
  title: { fontSize: 28, color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.ink },
  button: { height: sizes.button, borderRadius: radii.capsule, alignItems: 'center', justifyContent: 'center' },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonPlain: { backgroundColor: 'transparent' },
  buttonText: { fontSize: 17 },
  field: {
    fontSize: 22,
    color: colors.ink,
    paddingVertical: space.sm,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderBottomColor: colors.hairline,
  },
  choiceRow: { flexDirection: 'row', gap: space.sm },
  choice: {
    flex: 1,
    height: 48,
    borderRadius: radii.capsule,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  choiceText: { fontSize: 16, color: colors.ink },
  label: { fontSize: 14, color: colors.inkSecondary, marginTop: space.sm },
  chipScroll: { flexGrow: 0 },
  chipRow: { gap: space.sm },
  chip: {
    height: 40,
    paddingHorizontal: space.md,
    borderRadius: radii.capsule,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.lg, alignSelf: 'flex-start' },
  stepBtn: {
    width: 44,
    height: 44,
    borderRadius: radii.capsule,
    borderWidth: 1,
    borderColor: colors.hairline,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: { fontSize: 22, color: colors.ink },
  stepValue: { fontSize: 28, color: colors.ink, minWidth: 32, textAlign: 'center' },
});
