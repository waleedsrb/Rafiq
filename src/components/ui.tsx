// The building blocks every screen uses, matching the Rafiq design system (C5).
// Screens describe *what* to show; the look (tokens) lives in one place.
//
// Layout rules from the mockups: 20pt side margins, glass buttons on top,
// content from the top, the main action pinned at the bottom.

import { BlurView } from 'expo-blur';
import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
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
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
} from 'react-native-reanimated';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { isRTL } from '@/i18n';
import { goBack } from '@/lib/nav';
import { useT } from '@/lib/session';
import { selectFeel, tapFeel } from '@/lib/haptics';
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
  hero,
  tab,
}: {
  children: ReactNode;
  /** A tab's root screen: the system tab bar floats over the bottom, so leave room for it. */
  tab?: boolean;
  /** Full-bleed picture at the very top (e.g. a map). The top bar floats over it and
   *  the content sits on a sheet with rounded corners that overlaps its bottom edge. */
  hero?: ReactNode;
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
  const insets = useSafeAreaInsets();
  const topBar = top ?? (back ? <TopBar start={<BackButton />} /> : null);
  if (hero) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom']}>
        <View style={[styles.flex, { direction }]}>
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={overlay ? { paddingBottom: 120 } : null}>
            {hero}
            <View style={[styles.sheet, styles.content, contentStyle]}>{children}</View>
          </ScrollView>
          {topBar ? <View style={[styles.heroBar, { top: insets.top }]}>{topBar}</View> : null}
          {footer ? <View style={styles.footer}>{footer}</View> : null}
          {overlay}
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safe} edges={tab ? ['top'] : ['top', 'bottom']}>
      <KeyboardAvoidingView style={[styles.flex, { direction }]} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {topBar}
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, overlay || tab ? { paddingBottom: 120 } : null, contentStyle]}
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

// iOS 26+: Apple's own Liquid Glass. Older iOS and Android: a frosted blur that imitates it.
const LIQUID_GLASS = isLiquidGlassAvailable();

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
      // Real glass reacts to the touch itself; the blur fallback dims instead.
      style={({ pressed }) => [styles.glassButton, LIQUID_GLASS && styles.glassButtonLiquid, !LIQUID_GLASS && pressed && { opacity: 0.7 }]}
    >
      {LIQUID_GLASS ? (
        <GlassView style={[StyleSheet.absoluteFill, { borderRadius: sizes.touch / 2 }]} glassEffectStyle="regular" isInteractive />
      ) : (
        <>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.glassFill} />
        </>
      )}
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

/**
 * A tab's root page (Home, My trips, Checkpoints, Account). No back button, so the large
 * title starts right under the status bar. The way iOS apps do it:
 * - the page's action (bell, map) is pinned: it never scrolls away;
 * - the large title scrolls with the content, and as it leaves, a frosted bar fades in
 *   behind the action with a small centred title, so you always know where you are;
 * - `fixed` keeps a block (e.g. the profile card) still and scrolls only what's below it.
 * Subpages use `Screen back` instead: back button row, title underneath.
 */
export function TabScreen({
  title,
  largeTitle,
  kicker,
  action,
  fixed,
  children,
}: {
  /** The page name: the large title, and the small one in the bar once scrolled. */
  title: string;
  /** Replaces the large title (Home's greeting). */
  largeTitle?: ReactNode;
  /** Small line above the large title (Home's date). */
  kicker?: ReactNode;
  action?: ReactNode;
  /** Stays put under the title; only the children scroll. */
  fixed?: ReactNode;
  children: ReactNode;
}) {
  const { f, direction } = useFont();
  const insets = useSafeAreaInsets();
  const y = useSharedValue(0);
  const [headH, setHeadH] = useState<number>(sizes.touch);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const barH = insets.top + TAB_BAR_ROW;

  // Frost appears as soon as content starts to slide under the bar.
  const frost = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 16], [0, 1], Extrapolation.CLAMP) }));
  // The small title arrives as the large one finishes leaving.
  const small = useAnimatedStyle(() => ({
    opacity: interpolate(y.value, [headH * 0.6, headH], [0, 1], Extrapolation.CLAMP),
  }));
  const line = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [0, 16], [0, 1], Extrapolation.CLAMP) }));

  const head = (
    <View style={styles.tabHeader} onLayout={(e) => setHeadH(e.nativeEvent.layout.height)}>
      <View style={styles.tabHeaderText}>
        {kicker}
        {largeTitle ?? <Title>{title}</Title>}
      </View>
      {/* Room for the pinned action, which floats over this spot. */}
      {action ? <View style={styles.topSpacer} /> : null}
    </View>
  );

  if (fixed) {
    return (
      <View style={[styles.safe, { direction, paddingTop: insets.top + space.sm }]}>
        <View style={[styles.tabFixed]}>
          {head}
          {fixed}
        </View>
        <View style={styles.flex}>
          <Animated.ScrollView
            onScroll={onScroll}
            scrollEventThrottle={16}
            contentContainerStyle={[styles.content, { paddingBottom: 120 }]}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </Animated.ScrollView>
          {/* A hairline once the list slides under the fixed block. */}
          <Animated.View pointerEvents="none" style={[styles.tabLine, { top: 0 }, line]} />
        </View>
        {action ? <View style={[styles.tabAction, { top: insets.top + space.sm }]}>{action}</View> : null}
      </View>
    );
  }

  return (
    <View style={[styles.safe, { direction }]}>
      <Animated.ScrollView
        onScroll={onScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + space.sm, paddingBottom: 120 }]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {head}
        {children}
      </Animated.ScrollView>

      <View pointerEvents="box-none" style={[styles.tabBar, { height: barH }]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, frost]}>
          <BlurView intensity={40} tint="light" style={StyleSheet.absoluteFill} />
          <View style={styles.glassFill} />
        </Animated.View>
        <Animated.View pointerEvents="none" style={[styles.tabLine, { bottom: 0 }, line]} />
        <Animated.Text
          numberOfLines={1}
          style={[styles.tabSmallTitle, { top: insets.top, height: TAB_BAR_ROW, fontFamily: f.bold }, small]}
        >
          {title}
        </Animated.Text>
        {action ? <View style={[styles.tabAction, { top: insets.top + space.sm }]}>{action}</View> : null}
      </View>
    </View>
  );
}

/** Height of the pinned row under the status bar: the 44pt action with 8pt above and below. */
const TAB_BAR_ROW = sizes.touch + space.sm * 2;

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
      onPress={() => {
        if (primary) tapFeel();
        onPress();
      }}
      style={({ pressed }) => [
        styles.button,
        pressed && { transform: [{ scale: 0.98 }] },
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
        <Chip key={String(o.value)} label={o.label} selected={o.value === value} onPress={() => {
            selectFeel();
            onChange(o.value);
          }} />
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
            onPress={() => {
              selectFeel();
              onChange(o.value);
            }}
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
      onPress={() => {
        selectFeel();
        onChange(next);
      }}
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
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.quick, pressed && { opacity: 0.7, transform: [{ scale: 0.95 }] }]}
    >
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
  tabHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: sizes.touch },
  tabHeaderText: { flex: 1, gap: 2 },
  tabFixed: { paddingHorizontal: space.screen, paddingBottom: space.md, gap: space.md },
  tabBar: { position: 'absolute', top: 0, left: 0, right: 0 },
  tabAction: { position: 'absolute', end: space.screen },
  tabLine: { position: 'absolute', left: 0, right: 0, height: StyleSheet.hairlineWidth, backgroundColor: colors.hairline },
  tabSmallTitle: {
    position: 'absolute',
    left: 72,
    right: 72,
    textAlign: 'center',
    textAlignVertical: 'center',
    lineHeight: TAB_BAR_ROW,
    fontSize: 17,
    color: colors.ink,
  },
  sheet: {
    marginTop: -radii.sheet,
    borderTopLeftRadius: radii.sheet,
    borderTopRightRadius: radii.sheet,
    backgroundColor: colors.surface,
    paddingTop: space.lg,
  },
  heroBar: { position: 'absolute', left: 0, right: 0 },
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
  // Liquid Glass draws its own edge and depth: no border or drop shadow on top of it.
  glassButtonLiquid: { borderWidth: 0, shadowOpacity: 0, elevation: 0, overflow: 'visible' },
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

});
