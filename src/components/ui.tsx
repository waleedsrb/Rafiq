// The handful of building blocks every screen uses. Keeping them here means
// screens describe *what* to show, and the look (tokens) lives in one place.

import type { ReactNode } from 'react';
import {
  ActivityIndicator,
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
export function Screen({ children, footer }: { children: ReactNode; footer?: ReactNode }) {
  const { direction } = useFont();
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView
        style={[styles.flex, { direction }]}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.content}>{children}</View>
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

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  content: { flex: 1, paddingHorizontal: space.lg, paddingTop: space.xl, gap: space.md },
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
});
