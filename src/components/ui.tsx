// The building blocks every screen uses, matching the Rafiq design system (C5).
// Screens describe *what* to show; the look (tokens) lives in one place.
//
// Layout rules from the mockups: 20pt side margins, glass buttons on top,
// content from the top, the main action pinned at the bottom.

import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { isRTL } from '@/i18n';
import { goBack } from '@/lib/nav';
import { useT } from '@/lib/session';
import { colors, fonts, radii, shadows, sizes, space } from '@/theme/tokens';

import { Icon, type IconName } from './icon';

export function useFont() {
  const { lang } = useT();
  const rtl = isRTL(lang);
  return { f: fonts[lang], rtl, direction: rtl ? ('rtl' as const) : ('ltr' as const) };
}

/** Wrap numbers, times and plates so they stay left-to-right inside Arabic. */
export const ltr = (s: string | number) => `⁦${s}⁩`;

/** Full-screen page: safe area, porcelain background, top bar, content, actions at the bottom. */
export function Screen({
  children,
  footer,
  scroll,
  top,
  back,
  overlay,
  contentStyle,
}: {
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  /** Replaces the default top bar (a back button when `back` is set). */
  top?: ReactNode;
  back?: boolean;
  /** Floats over the bottom of the screen, e.g. the dock. */
  overlay?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
}) {
  const { direction } = useFont();
  const topBar = top ?? (back ? <TopBar start={<BackButton />} /> : null);
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={[styles.flex, { direction }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {topBar}
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, overlay ? { paddingBottom: 120 } : null, contentStyle]}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
        {overlay}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** The row of glass buttons at the top of a screen. */
export function TopBar({ start, end }: { start?: ReactNode; end?: ReactNode }) {
  return (
    <View style={styles.topBar}>
      {start ?? <View style={styles.topSpacer} />}
      {end ?? <View style={styles.topSpacer} />}
    </View>
  );
}

/** Frosted circle button for the navigation layer (the only place glass is used). */
export function GlassButton({
  icon,
  label,
  onPress,
  flip,
  dot,
  children,
}: {
  icon?: IconName;
  label: string;
  onPress?: () => void;
  flip?: boolean;
  dot?: boolean;
  children?: ReactNode;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.glassButton, pressed && { opacity: 0.7 }]}
    >
      <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
      <View style={styles.glassFill} />
      <View style={styles.glassContent}>{icon ? <Icon name={icon} flip={flip} /> : children}</View>
      {dot ? <View style={styles.glassDot} /> : null}
    </Pressable>
  );
}

/** Back: the chevron points toward where you came from (right in Arabic, left in English). */
export function BackButton() {
  const { t } = useT();
  const { rtl } = useFont();
  return <GlassButton icon={rtl ? 'caretRight' : 'caretLeft'} label={t('back')} onPress={goBack} />;
}

export function Title({ children, size = 'title' }: { children: ReactNode; size?: 'title' | 'display' }) {
  const { f } = useFont();
  return <Text style={[size === 'display' ? styles.display : styles.title, { fontFamily: f.bold }]}>{children}</Text>;
}

export function Body({
  children,
  muted,
  error,
  signal,
  small,
  style,
}: {
  children: ReactNode;
  muted?: boolean;
  error?: boolean;
  signal?: boolean;
  small?: boolean;
  style?: StyleProp<TextStyle>;
}) {
  const { f } = useFont();
  return (
    <Text
      style={[
        small ? styles.small : styles.body,
        { fontFamily: f.regular },
        muted && { color: colors.inkSecondary },
        error && { color: colors.statusClosed },
        signal && { color: colors.clay, fontFamily: f.medium },
        style,
      ]}
    >
      {children}
    </Text>
  );
}

/** Small grey caption, e.g. above a field or a section. */
export function Label({ children }: { children: ReactNode }) {
  const { f } = useFont();
  return <Text style={[styles.label, { fontFamily: f.medium }]}>{children}</Text>;
}

/** A section heading inside a screen, e.g. "Passengers". */
export function SectionTitle({ children }: { children: ReactNode }) {
  const { f } = useFont();
  return <Text style={[styles.sectionTitle, { fontFamily: f.bold }]}>{children}</Text>;
}

/** Full-width capsule button. `primary` is graphite; `secondary` is an outline. */
export function Button({
  label,
  onPress,
  disabled,
  loading,
  variant = 'primary',
  icon,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'plain';
  icon?: IconName;
}) {
  const { f } = useFont();
  const primary = variant === 'primary';
  const color = primary ? colors.onInk : colors.ink;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: disabled || loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary && styles.buttonPrimary,
        variant === 'secondary' && styles.buttonSecondary,
        primary && pressed && { backgroundColor: colors.inkPressed },
        !primary && pressed && { opacity: 0.6 },
        (disabled || loading) && { opacity: 0.4 },
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} />
      ) : (
        <>
          {icon ? <Icon name={icon} color={color} size={20} /> : null}
          <Text style={[styles.buttonText, { fontFamily: f.medium, color }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Underlined text button, e.g. "Change the number". */
export function TextLink({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { f } = useFont();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={disabled} style={styles.textLink} hitSlop={8}>
      <Text style={[styles.textLinkText, { fontFamily: f.medium }, disabled && { color: colors.inkSecondary }]}>{label}</Text>
    </Pressable>
  );
}

/** White capsule input with a caption above. Graphite 2pt border while focused. */
export function Field({
  label,
  ltr: isLtr,
  prefix,
  style,
  ...rest
}: TextInputProps & { label?: string; ltr?: boolean; prefix?: string }) {
  const { f, direction } = useFont();
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.fieldWrap}>
      {label ? <Label>{label}</Label> : null}
      <View style={[styles.field, focused && styles.fieldFocused, isLtr && { flexDirection: 'row', direction: 'ltr' }]}>
        {prefix ? (
          <Text style={[styles.fieldPrefix, { fontFamily: fonts.en.medium }]}>{prefix}</Text>
        ) : null}
        <TextInput
          placeholderTextColor={colors.inkSecondary}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
          style={[
            styles.fieldInput,
            { fontFamily: isLtr ? fonts.en.regular : f.regular },
            // Phone numbers, codes and plates read left to right even in Arabic.
            { textAlign: isLtr || direction === 'ltr' ? 'left' : 'right', writingDirection: isLtr ? 'ltr' : direction },
            style,
          ]}
        />
      </View>
    </View>
  );
}

/** Capsule chip. Selected = graphite. */
export function Chip({
  label,
  selected,
  onPress,
  icon,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
  icon?: IconName;
}) {
  const { f } = useFont();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected: !!selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      {icon ? <Icon name={icon} size={14} color={selected ? colors.onInk : colors.ink} /> : null}
      <Text style={[styles.chipText, { fontFamily: f.medium }, selected && { color: colors.onInk }]}>{label}</Text>
    </Pressable>
  );
}

/** A row of chips that scrolls sideways when it doesn't fit (e.g. days). */
export function ChipRow<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipScroll} contentContainerStyle={styles.chipRow}>
      {options.map((o) => (
        <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => onChange(o.value)} />
      ))}
    </ScrollView>
  );
}

/** Segmented control: a sunken track with a white pill on the chosen option. */
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
    <View style={styles.segment}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            onPress={() => onChange(o.value)}
            style={[styles.segmentItem, selected && styles.segmentSelected]}
          >
            <Text style={[styles.segmentText, { fontFamily: f.medium }, !selected && { color: colors.inkSecondary }]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** − 3 + control for small whole numbers. Kept left-to-right like a number line. */
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
  const btn = (icon: IconName, label: string, next: number, disabled: boolean) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => onChange(next)}
      style={[styles.stepBtn, disabled && { opacity: 0.3 }]}
    >
      <Icon name={icon} size={18} />
    </Pressable>
  );
  return (
    <View style={[styles.stepper, { direction: 'ltr' }]}>
      {btn('minus', 'decrease', value - 1, value <= min)}
      <Text style={[styles.stepValue, { fontFamily: fonts.en.bold }]}>{value}</Text>
      {btn('plus', 'increase', value + 1, value >= max)}
    </View>
  );
}

/** 40pt sunken circle holding an icon or a letter (avatars). */
export function IconCircle({ icon, letter, size = 40 }: { icon?: IconName; letter?: string; size?: number }) {
  const { f } = useFont();
  return (
    <View style={[styles.iconCircle, { width: size, height: size, borderRadius: size / 2 }]}>
      {icon ? <Icon name={icon} size={20} /> : <Text style={[styles.letter, { fontFamily: f.bold }]}>{letter}</Text>}
    </View>
  );
}

/** A list row on the porcelain, separated by a hairline: icon, title, subtitle, chevron. */
export function ListRow({
  icon,
  leading,
  title,
  subtitle,
  trailing,
  onPress,
  last,
}: {
  icon?: IconName;
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  trailing?: ReactNode;
  onPress?: () => void;
  last?: boolean;
}) {
  const { f, rtl } = useFont();
  const content = (
    <>
      {leading ?? (icon ? <IconCircle icon={icon} /> : null)}
      <View style={styles.rowText}>
        {typeof title === 'string' ? <Text style={[styles.rowTitle, { fontFamily: f.medium, textAlign: rtl ? 'right' : 'left' }]}>{title}</Text> : title}
        {subtitle ? (
          typeof subtitle === 'string' ? (
            <Text style={[styles.rowSubtitle, { fontFamily: f.regular, textAlign: rtl ? 'right' : 'left' }]}>{subtitle}</Text>
          ) : (
            subtitle
          )
        ) : null}
      </View>
      {trailing ?? (onPress ? <Icon name={rtl ? 'caretLeft' : 'caretRight'} size={18} color={colors.inkSecondary} /> : null)}
    </>
  );
  const style = [styles.row, !last && styles.rowLine];
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [style, pressed && { opacity: 0.6 }]}>
      {content}
    </Pressable>
  ) : (
    <View style={style}>{content}</View>
  );
}

/** Quick action: a 56pt sunken circle with a label under it. */
export function QuickAction({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }) {
  const { f } = useFont();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => [styles.quick, pressed && { opacity: 0.6 }]}>
      <View style={styles.quickCircle}>
        <Icon name={icon} />
      </View>
      <Text style={[styles.quickLabel, { fontFamily: f.medium }]}>{label}</Text>
    </Pressable>
  );
}

/** Clay countdown line with a thin progress bar, for "waiting on someone". */
export function Countdown({ label, remaining, progress }: { label: string; remaining: string; progress: number }) {
  const { f } = useFont();
  return (
    <View style={{ gap: space.sm }}>
      <View style={styles.countdownRow}>
        <Text style={[styles.countdownText, { fontFamily: f.medium }]}>{label}</Text>
        <Text style={[styles.countdownText, { fontFamily: fonts.en.medium }]}>{ltr(remaining)}</Text>
      </View>
      <View style={styles.countdownTrack}>
        <View style={[styles.countdownBar, { width: `${Math.max(0, Math.min(1, progress)) * 100}%` }]} />
      </View>
    </View>
  );
}

/** The frosted tab bar at the bottom. Selected tab = Fill icon on a soft pill. */
export type DockTab = 'home' | 'trips' | 'checkpoints' | 'profile';
export function Dock({ current, tripsDot }: { current: DockTab; tripsDot?: boolean }) {
  const { t } = useT();
  const { f } = useFont();
  const tabs: { id: DockTab; icon: IconName; fill: IconName; label: string; href?: string }[] = [
    { id: 'home', icon: 'house', fill: 'houseFill', label: t('tabHome'), href: '/home' },
    { id: 'trips', icon: 'ticket', fill: 'ticketFill', label: t('tabTrips'), href: '/trips/mine' },
    { id: 'checkpoints', icon: 'barricade', fill: 'barricadeFill', label: t('tabCheckpoints'), href: '/checkpoints' },
    { id: 'profile', icon: 'user', fill: 'userFill', label: t('tabProfile'), href: '/account' },
  ];
  return (
    <View style={styles.dockWrap} pointerEvents="box-none">
      <View style={styles.dock}>
        <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
        <View style={styles.dockFill} />
        {tabs.map((tab) => {
          const selected = tab.id === current;
          const disabled = !tab.href;
          const color = selected ? colors.ink : colors.inkSecondary;
          return (
            <Pressable
              key={tab.id}
              accessibilityRole="tab"
              accessibilityState={{ selected, disabled }}
              accessibilityLabel={tab.label}
              disabled={disabled || selected}
              onPress={() => tab.href && router.replace(tab.href as never)}
              style={[styles.tab, selected && styles.tabSelected, disabled && { opacity: 0.4 }]}
            >
              <Icon name={selected ? tab.fill : tab.icon} color={color} />
              <Text style={[styles.tabLabel, { fontFamily: f.medium, color }]}>{tab.label}</Text>
              {tab.id === 'trips' && tripsDot ? <View style={styles.tabDot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.surface },
  flex: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.screen,
    paddingTop: space.md,
    paddingBottom: space.md,
  },
  topSpacer: { width: sizes.touch, height: sizes.touch },
  content: { flexGrow: 1, paddingHorizontal: space.screen, paddingTop: space.sm, paddingBottom: space.lg, gap: space.md },
  footer: { paddingHorizontal: space.screen, paddingBottom: space.sm, paddingTop: space.sm, gap: space.sm },

  glassButton: {
    width: sizes.touch,
    height: sizes.touch,
    borderRadius: sizes.touch / 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassEdge,
    backgroundColor: 'transparent',
    ...shadows.float,
  },
  glassContent: { zIndex: 1, alignItems: 'center', justifyContent: 'center' },
  glassFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: colors.glassFill },
  glassDot: {
    position: 'absolute',
    top: 10,
    left: 11,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.clay,
    borderWidth: 2,
    borderColor: colors.card,
  },

  title: { fontSize: 28, lineHeight: 36, color: colors.ink, letterSpacing: -0.4 },
  display: { fontSize: 34, lineHeight: 42, color: colors.ink, letterSpacing: -0.5 },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink },
  small: { fontSize: 13, lineHeight: 18, color: colors.ink },
  label: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  sectionTitle: { fontSize: 17, lineHeight: 24, color: colors.ink, marginTop: space.sm },

  button: {
    height: sizes.button,
    borderRadius: radii.capsule,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 10,
  },
  buttonPrimary: { backgroundColor: colors.ink },
  buttonSecondary: { borderWidth: 1, borderColor: colors.ink, backgroundColor: 'transparent' },
  buttonText: { fontSize: 17 },
  textLink: { alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' },
  textLinkText: { fontSize: 14, color: colors.ink, textDecorationLine: 'underline' },

  fieldWrap: { gap: space.sm },
  field: {
    minHeight: sizes.button,
    borderRadius: sizes.button / 2,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    paddingHorizontal: 18,
    alignItems: 'center',
    flexDirection: 'row',
  },
  fieldFocused: { borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 17 },
  fieldPrefix: {
    fontSize: 16,
    color: colors.ink,
    paddingRight: 10,
    marginRight: 10,
    borderRightWidth: 1,
    borderRightColor: colors.hairline,
  },
  fieldInput: {
    flex: 1,
    fontSize: 17,
    color: colors.ink,
    paddingVertical: 14,
    // The browser draws its own focus box inside ours; the capsule border already shows focus.
    ...(Platform.OS === 'web' ? ({ outlineStyle: 'none' } as object) : null),
  },

  chipScroll: { flexGrow: 0 },
  chipRow: { gap: space.sm },
  chip: {
    height: sizes.controlSm,
    paddingHorizontal: space.md,
    borderRadius: sizes.controlSm / 2,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { fontSize: 13, color: colors.ink },

  segment: {
    flexDirection: 'row',
    backgroundColor: colors.sunken,
    borderRadius: radii.capsule,
    padding: 4,
    gap: 4,
  },
  segmentItem: { flex: 1, height: 40, borderRadius: radii.capsule, alignItems: 'center', justifyContent: 'center' },
  segmentSelected: { backgroundColor: colors.card, ...shadows.float, shadowOpacity: 0.06 },
  segmentText: { fontSize: 14, color: colors.ink },

  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.md, alignSelf: 'flex-start' },
  stepBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepValue: { fontSize: 22, color: colors.ink, minWidth: 28, textAlign: 'center' },

  iconCircle: { backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  letter: { fontSize: 15, color: colors.ink },

  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 60, paddingVertical: space.sm },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.hairline },
  rowText: { flex: 1, gap: 2 },
  rowTitle: { fontSize: 16, lineHeight: 22, color: colors.ink },
  rowSubtitle: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },

  quick: { alignItems: 'center', gap: space.sm, width: 72 },
  quickCircle: {
    width: sizes.button,
    height: sizes.button,
    borderRadius: sizes.button / 2,
    backgroundColor: colors.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickLabel: { fontSize: 12, color: colors.ink, textAlign: 'center' },

  countdownRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  countdownText: { fontSize: 14, lineHeight: 20, color: colors.clay },
  countdownTrack: { height: 2, borderRadius: 1, backgroundColor: colors.claySoft, overflow: 'hidden' },
  countdownBar: { height: '100%', backgroundColor: colors.clay },

  dockWrap: { position: 'absolute', left: space.screen, right: space.screen, bottom: 24 },
  dock: {
    height: sizes.dock,
    borderRadius: sizes.dock / 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.sm,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.glassEdge,
    ...shadows.glass,
  },
  dockFill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.74)' },
  tab: { width: 80, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', gap: 2 },
  tabSelected: { backgroundColor: colors.glassLens },
  tabLabel: { fontSize: 11 },
  tabDot: { position: 'absolute', top: 8, left: 24, width: 7, height: 7, borderRadius: 4, backgroundColor: colors.clay },
});
