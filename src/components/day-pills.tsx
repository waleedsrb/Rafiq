// The day pills (today plus six) with a calendar button pinned at the end: the pills scroll
// under it (Nov 11). The calendar
// is a month grid up to AHEAD_DAYS ahead; past days and days beyond the limit are greyed.
// With `children` (Post a trip: the time ruler), the calendar takes the children's place in
// a box of fixed height, so the card never changes size and the swap is a short cross-fade
// on the UI thread. Without children (search), it opens under the pills. A day further out than the pills shows up as its own pill
// ("Fri 27 Nov") while it is picked.
//
// Used by Post a trip, the search on Home and the results page, so all of them pick days
// the same way.
//
// Search (`onClear` given, Nov 11, design A): picking a day is optional. Nothing picked =
// every day; tapping the picked pill (it shows a small ×) un-picks it. The calendar is a
// glass circle pinned at the row's end: the pills slide under it, blurred by the glass. A far
// day picked in the calendar shows its date inside the circle, which turns solid graphite,
// as it does while the month is open (the month itself sits on the page, solid: it is
// content to read, not a floating control).

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BlurView } from 'expo-blur';
import { Pressable, ScrollView, StyleSheet, Text, View, type ScrollViewInstance } from 'react-native';
import Animated, { Easing, FadeIn, FadeOut, useAnimatedStyle, useReducedMotion, useSharedValue, withTiming } from 'react-native-reanimated';

import { Icon } from '@/components/icon';
import { PillChips, useFont } from '@/components/ui';
import { formatChipDay, formatDay, formatMonth, weekdayLetters } from '@/lib/format';
import { selectFeel } from '@/lib/haptics';
import { monthCells } from '@/lib/leave-time';
import { useT } from '@/lib/session';
import { AHEAD_DAYS, PILL_DAYS, searchDayStart } from '@/lib/trip-search';
import type { Language } from '@/i18n';
import { colors, fonts, space } from '@/theme/tokens';

/** Day `d` (0 = today) as a pill label. */
export function dayLabel(d: number, t: (k: 'today' | 'tomorrow') => string, lang: Language, now = new Date()): string {
  if (d === 0) return t('today');
  if (d === 1) return t('tomorrow');
  const date = searchDayStart(d, now);
  return d < PILL_DAYS ? formatChipDay(date, lang) : formatDay(date, lang).replace('،', '');
}

export function DayPills({
  day: dayOrNull,
  onDay,
  onClear,
  extra,
  dots,
  padding,
  inset = 0,
  children,
}: {
  /** 0 = today .. AHEAD_DAYS, or -1 when the extra pill is picked; null = none (search only). */
  day: number | null;
  onDay: (d: number) => void;
  /** Search: un-pick the day (tap the picked pill again). Also pins the calendar. */
  onClear?: () => void;
  /** Side margin of the row, when it runs edge to edge. */
  inset?: number;
  /** One more pill after the days, like "Weekly" on Post a trip. */
  extra?: { label: string; onPick: () => void };
  /** Days with something on them (trips found), marked with a dot in the calendar. */
  dots?: number[];
  padding?: number;
  /** What the calendar replaces while it is open (kept mounted, so it keeps its state). */
  children?: ReactNode;
}) {
  const { t, lang } = useT();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const scroller = useRef<ScrollViewInstance>(null);

  const pinned = !!onClear;
  // -2: nothing picked (never matches a day, the extra pill or a calendar cell).
  const day = dayOrNull ?? -2;
  const far = day >= PILL_DAYS ? day : null;
  const labels = Array.from({ length: PILL_DAYS }, (_, i) => dayLabel(i, t, lang));
  // Pinned, a far day shows in the calendar circle instead of as a pill of its own.
  if (far !== null && !pinned) labels.push(dayLabel(far, t, lang));
  if (extra) labels.push(extra.label);
  const extraIndex = extra ? labels.length - 1 : -1;
  const selected = day === -1 ? extraIndex : far !== null ? (pinned ? -1 : PILL_DAYS) : day < 0 ? -1 : day;
  // Days with nothing on them look lighter (still tappable), once we know.
  const faint = pinned && dots ? labels.map((_, i) => i < PILL_DAYS && !dots[i]) : undefined;

  const pick = (d: number) => {
    setOpen(false);
    if (pinned && d === day) return onClear?.();
    onDay(d);
    // A far day lands at the end of the row: bring it into view.
    if (d >= PILL_DAYS && !pinned) requestAnimationFrame(() => scroller.current?.scrollToEnd({ animated: true }));
  };
  const toggle = () => {
    selectFeel();
    setOpen((o) => !o);
  };

  if (pinned) {
    const solid = open || far !== null;
    return (
      <View style={{ gap: space.sm }}>
        <View style={{ justifyContent: 'center' }}>
          <ScrollView
            ref={scroller}
            horizontal
            showsHorizontalScrollIndicator={false}
            style={{ flexGrow: 0 }}
            // Room at the end so the last pill can scroll out from under the circle.
            contentContainerStyle={[styles.row, { paddingStart: inset, paddingEnd: inset + CIRCLE + space.sm }]}
          >
            <PillChips
              labels={labels}
              selected={selected}
              padding={padding}
              clearable
              faint={faint}
              onPick={(i) => {
                setOpen(false);
                if (i === selected) onClear?.();
                else onDay(i);
              }}
            />
          </ScrollView>
          <View style={[styles.pin, { end: Math.max(0, inset - 2) }]}>
            {solid ? (
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={far !== null ? `${t('pickDate')}: ${formatDay(searchDayStart(far, new Date()), lang)}` : t('pickDate')}
                accessibilityState={{ expanded: open }}
                onPress={toggle}
                hitSlop={4}
                style={({ pressed }) => [styles.circle, pressed && { opacity: 0.7 }]}
              >
                {far !== null && !open ? (
                  <Text style={styles.circleDate}>{searchDayStart(far, new Date()).getDate()}</Text>
                ) : (
                  <Icon name="calendar" size={18} color={colors.onInk} />
                )}
              </Pressable>
            ) : (
              <FrostedCircle size={CIRCLE} label={t('pickDate')} expanded={open} onPress={toggle} />
            )}
          </View>
        </View>
        {open ? (
          <Animated.View
            style={{ paddingHorizontal: inset }}
            entering={reduced ? undefined : FadeIn.duration(220)}
            exiting={reduced ? undefined : FadeOut.duration(160)}
          >
            <MonthGrid day={day} onPick={pick} dots={dots} />
          </Animated.View>
        ) : null}
      </View>
    );
  }

  return (
    <View style={{ gap: space.sm }}>
      {/* The calendar stays pinned at the row's end; the pills scroll under it (Nov 11). */}
      <View style={{ justifyContent: 'center' }}>
        <ScrollView ref={scroller} horizontal showsHorizontalScrollIndicator={false} style={{ flexGrow: 0 }} contentContainerStyle={[styles.row, { paddingEnd: CAL + space.sm }]}>
          <PillChips
            labels={labels}
            selected={selected}
            padding={padding}
            onPick={(i) => {
              setOpen(false);
              if (i === extraIndex) extra?.onPick();
              else if (far !== null && i === PILL_DAYS) onDay(far);
              else onDay(i);
            }}
          />
        </ScrollView>
        <View style={[styles.pin, { end: 0 }]}>
          {open ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('pickDate')}
              accessibilityState={{ expanded: true }}
              onPress={toggle}
              hitSlop={4}
              style={({ pressed }) => [styles.cal, styles.calOn, pressed && { opacity: 0.6 }]}
            >
              <Icon name="calendar" size={18} color={colors.onInk} />
            </Pressable>
          ) : (
            <FrostedCircle size={CAL} label={t('pickDate')} expanded={false} onPress={toggle} />
          )}
        </View>
      </View>
      {children !== undefined ? (
        <Stage open={open} reduced={reduced} calendar={<MonthGrid day={day} onPick={pick} dots={dots} />}>
          {children}
        </Stage>
      ) : open ? (
        <Animated.View entering={reduced ? undefined : FadeIn.duration(220)} exiting={reduced ? undefined : FadeOut.duration(160)}>
          <MonthGrid day={day} onPick={pick} dots={dots} />
        </Animated.View>
      ) : null}
    </View>
  );
}

/** Tall enough for a six-week month: the card keeps one height whichever is showing. */
const STAGE_H = 304;
const EASE = Easing.bezier(0.22, 1, 0.36, 1);

/** The time (or whatever was given) and the calendar in one fixed box, cross-fading. */
function Stage({ open, reduced, calendar, children }: { open: boolean; reduced: boolean; calendar: ReactNode; children: ReactNode }) {
  const p = useSharedValue(open ? 1 : 0);
  // Build the calendar the first time it is asked for, then keep it, so opening again is instant.
  const [built, setBuilt] = useState(open);
  useEffect(() => {
    if (open) setBuilt(true);
    p.value = reduced ? (open ? 1 : 0) : withTiming(open ? 1 : 0, { duration: open ? 320 : 260, easing: EASE });
  }, [open, reduced, p]);
  const out = useAnimatedStyle(() => ({
    opacity: 1 - p.value,
    transform: [{ translateY: -10 * p.value }, { scale: 1 - 0.04 * p.value }],
  }));
  const into = useAnimatedStyle(() => ({
    opacity: p.value,
    transform: [{ translateY: 12 * (1 - p.value) }, { scale: 0.97 + 0.03 * p.value }],
  }));
  return (
    <View style={styles.stage}>
      <Animated.View style={[styles.centred, out]} pointerEvents={open ? 'none' : 'auto'}>
        {children}
      </Animated.View>
      {built ? (
        <Animated.View style={[styles.layer, into]} pointerEvents={open ? 'auto' : 'none'}>
          {calendar}
        </Animated.View>
      ) : null}
    </View>
  );
}

function MonthGrid({ day, onPick, dots }: { day: number; onPick: (d: number) => void; dots?: number[] }) {
  const { t, lang } = useT();
  const { f } = useFont();
  const now = new Date();
  const last = searchDayStart(AHEAD_DAYS, now);
  const lastOffset = (last.getFullYear() - now.getFullYear()) * 12 + last.getMonth() - now.getMonth();
  // Open on the month of the picked day.
  const pickedOffset = day > 0 ? (() => {
    const d = searchDayStart(day, now);
    return (d.getFullYear() - now.getFullYear()) * 12 + d.getMonth() - now.getMonth();
  })() : 0;
  const [offset, setOffset] = useState(pickedOffset);
  const { first, cells } = monthCells(now, offset);
  const letters = weekdayLetters(lang);

  return (
    <View style={styles.month}>
      <View style={styles.monthHead}>
        <Text style={[styles.monthTitle, { fontFamily: f.medium }]}>{formatMonth(first, lang)}</Text>
        <View style={styles.arrows}>
          <MonthArrow label={t('prevMonth')} icon="caretLeft" disabled={offset <= 0} onPress={() => setOffset((o) => o - 1)} />
          <MonthArrow label={t('nextMonth')} icon="caretRight" disabled={offset >= lastOffset} onPress={() => setOffset((o) => o + 1)} />
        </View>
      </View>
      <Animated.View key={offset} entering={FadeIn.duration(200)} style={styles.grid}>
        {letters.map((l, i) => (
          <Text key={`w${i}`} style={[styles.weekday, { fontFamily: f.regular }]}>
            {l}
          </Text>
        ))}
        {cells.map((d, i) => {
          if (d === null) return <View key={`e${i}`} style={styles.cell} />;
          const ok = d >= 0 && d <= AHEAD_DAYS;
          const on = d === day;
          const date = searchDayStart(d, now);
          return (
            <View key={`d${i}`} style={styles.cell}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={formatDay(date, lang)}
                accessibilityState={{ disabled: !ok, selected: on }}
                disabled={!ok}
                onPress={() => {
                  selectFeel();
                  onPick(d);
                }}
                style={({ pressed }) => [styles.dayBtn, d === 0 && !on && styles.today, on && styles.dayOn, pressed && { opacity: 0.6 }]}
              >
                <Text style={[styles.dayText, !ok && styles.dayOff, on && styles.dayTextOn]}>{date.getDate()}</Text>
                {ok && !on && dots?.[d] ? <View style={styles.dot} /> : null}
              </Pressable>
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
}

function MonthArrow({ label, icon, disabled, onPress }: { label: string; icon: 'caretLeft' | 'caretRight'; disabled: boolean; onPress: () => void }) {
  const { rtl } = useFont();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.arrow, (disabled || pressed) && { opacity: disabled ? 0.25 : 0.5 }]}
    >
      {/* flip: in Arabic "previous" points right, the way the row reads. */}
      <Icon name={icon} size={18} flip={rtl} />
    </Pressable>
  );
}

/**
 * The calendar button while closed: a frosted circle. The pills scroll under it and are
 * blurred away behind it (a real blur plus a strong porcelain wash, so they never read through).
 * Not Liquid Glass: native glass inside the search's clipped layer drops to a see-through
 * look, and on Post a trip it sits on a card (Waleed, Nov 11).
 */
function FrostedCircle({ size, label, expanded, onPress }: { size: number; label: string; expanded: boolean; onPress: () => void }) {
  const round = { width: size, height: size, borderRadius: size / 2 };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ expanded }}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [round, styles.frostLift, pressed && { transform: [{ scale: 0.94 }] }]}
    >
      <View style={[round, styles.frost]}>
        <BlurView intensity={60} tint="light" style={StyleSheet.absoluteFill} />
        <View style={[StyleSheet.absoluteFill, styles.frostWash]} />
        <Icon name="calendar" size={18} color={colors.ink} />
      </View>
    </Pressable>
  );
}

const CELL = `${100 / 7}%` as const;
/** The pinned calendar circle: the touch size, like the glass buttons on the tab pages. */
const CIRCLE = 44;
/** Post a trip's pinned calendar button. */
const CAL = 40;

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cal: {
    width: CAL,
    height: CAL,
    borderRadius: CAL / 2,
    borderWidth: 1.5,
    borderColor: colors.lineStrong,
    backgroundColor: 'rgba(247,246,243,0.72)',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pin: { position: 'absolute' },
  // The shadow sits on an outer view: the inner one clips the blur to the circle.
  frostLift: { backgroundColor: 'transparent', shadowColor: colors.ink, shadowOpacity: 0.1, shadowRadius: 10, shadowOffset: { width: 0, height: 3 }, elevation: 3 },
  frost: { overflow: 'hidden', alignItems: 'center', justifyContent: 'center', borderWidth: StyleSheet.hairlineWidth, borderColor: colors.lineStrong },
  frostWash: { backgroundColor: 'rgba(247,246,243,0.8)' },
  circle: { width: CIRCLE, height: CIRCLE, borderRadius: CIRCLE / 2, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  circleDate: { fontFamily: fonts.en.bold, fontSize: 16, color: colors.onInk, fontVariant: ['tabular-nums'] },
  // At least a month tall; taller only when what it holds is (the weekly chips).
  stage: { minHeight: STAGE_H },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  centred: { flex: 1, minHeight: STAGE_H, justifyContent: 'center', gap: space.md },
  // Flat on the card: no box of its own, just the month.
  month: { gap: 2 },
  monthHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingStart: 4, height: 40 },
  monthTitle: { fontSize: 17, color: colors.ink },
  arrows: { flexDirection: 'row', gap: 4 },
  arrow: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  weekday: { width: CELL, textAlign: 'center', fontSize: 12, color: colors.inkSecondary, paddingVertical: 2 },
  cell: { width: CELL, alignItems: 'center', paddingVertical: 1 },
  dayBtn: { width: 38, height: 38, borderRadius: 19, alignItems: 'center', justifyContent: 'center' },
  today: { borderWidth: 1, borderColor: colors.lineStrong },
  dayOn: { backgroundColor: colors.ink },
  dayText: { fontSize: 15, fontFamily: fonts.en.medium, color: colors.ink, fontVariant: ['tabular-nums'] },
  dayOff: { color: colors.lineStrong },
  dayTextOn: { color: colors.onInk },
  dot: { position: 'absolute', bottom: 5, width: 4, height: 4, borderRadius: 2, backgroundColor: colors.clay },
});
