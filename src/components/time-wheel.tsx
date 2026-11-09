// A time picker as three small wheels (hour, minute, AM/PM), like the iPhone's, so a
// departure time is picked, never typed. Minutes come in 5-minute steps.
//
// Each wheel is a snapping ScrollView: rows are ROW tall, the middle row is the chosen
// one, and a soft band behind it marks the choice. Digits are always left to right.

import { useEffect, useRef } from 'react';
import { ScrollView, StyleSheet, Text, View, type NativeScrollEvent, type NativeSyntheticEvent, type ScrollViewInstance } from 'react-native';

import { useFont } from '@/components/ui';
import { selectFeel } from '@/lib/haptics';
import { useT } from '@/lib/session';
import { colors, fonts, radii } from '@/theme/tokens';

const ROW = 40;
const VISIBLE = 3;
const HOURS = Array.from({ length: 12 }, (_, i) => i + 1); // 1..12
const MINUTES = Array.from({ length: 12 }, (_, i) => i * 5); // 0..55

/** 24-hour h:m in, 24-hour h:m out. */
export function TimeWheel({ h, m, onChange }: { h: number; m: number; onChange: (h: number, m: number) => void }) {
  const { t } = useT();
  const { f } = useFont();
  const pm = h >= 12;
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const to24 = (hour12: number, isPm: boolean) => (hour12 % 12) + (isPm ? 12 : 0);
  const mi = Math.round(m / 5) % 12;

  return (
    <View style={styles.wrap}>
      <View pointerEvents="none" style={styles.band} />
      <Wheel
        items={HOURS.map((x) => String(x))}
        index={h12 - 1}
        onPick={(i) => onChange(to24(i + 1, pm), MINUTES[mi])}
        font={fonts.en.bold}
        label="hour"
      />
      <Text style={[styles.colon, { fontFamily: fonts.en.bold }]}>:</Text>
      <Wheel
        items={MINUTES.map((x) => String(x).padStart(2, '0'))}
        index={mi}
        onPick={(i) => onChange(h, MINUTES[i])}
        font={fonts.en.bold}
        label="minute"
      />
      <Wheel items={[t('am'), t('pm')]} index={pm ? 1 : 0} onPick={(i) => onChange(to24(h12, i === 1), MINUTES[mi])} font={f.medium} label="am/pm" small />
    </View>
  );
}

function Wheel({
  items,
  index,
  onPick,
  font,
  label,
  small,
}: {
  items: string[];
  index: number;
  onPick: (i: number) => void;
  font: string;
  label: string;
  small?: boolean;
}) {
  const ref = useRef<ScrollViewInstance>(null);
  const shown = useRef(index);
  // Follow the value when it changes from outside (prefilled from your last trip).
  useEffect(() => {
    if (shown.current !== index) {
      shown.current = index;
      ref.current?.scrollTo({ y: index * ROW, animated: true });
    }
  }, [index]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const i = Math.max(0, Math.min(items.length - 1, Math.round(e.nativeEvent.contentOffset.y / ROW)));
    if (i !== shown.current) {
      shown.current = i;
      selectFeel();
      onPick(i);
    }
  };

  return (
    <ScrollView
      ref={ref}
      style={{ height: ROW * VISIBLE, flexGrow: 0, width: small ? 72 : 64 }}
      contentContainerStyle={{ paddingVertical: ROW }}
      contentOffset={{ x: 0, y: index * ROW }}
      snapToInterval={ROW}
      decelerationRate="fast"
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      onMomentumScrollEnd={settle}
      onScrollEndDrag={(e) => {
        // A slow drag with no fling never sends momentum-end.
        if (Math.abs(e.nativeEvent.velocity?.y ?? 0) < 0.05) settle(e);
      }}
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: items[index] }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(e) => {
        const next = e.nativeEvent.actionName === 'increment' ? index + 1 : index - 1;
        if (next >= 0 && next < items.length) onPick(next);
      }}
    >
      {items.map((s, i) => (
        <View key={s} style={styles.row}>
          <Text style={[styles.item, small && styles.itemSmall, { fontFamily: font }, i === index && (small ? styles.itemOnSmall : styles.itemOn)]}>{s}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', direction: 'ltr', alignItems: 'center', justifyContent: 'center', gap: 4, alignSelf: 'center' },
  band: {
    position: 'absolute',
    left: -12,
    right: -12,
    top: ROW,
    height: ROW,
    borderRadius: radii.md,
    backgroundColor: 'rgba(23,25,28,0.06)',
  },
  row: { height: ROW, alignItems: 'center', justifyContent: 'center' },
  item: { fontSize: 20, color: colors.inkSecondary },
  itemSmall: { fontSize: 15 },
  itemOn: { color: colors.ink, fontSize: 24 },
  itemOnSmall: { color: colors.ink, fontSize: 16 },
  colon: { fontSize: 22, color: colors.ink, marginBottom: 2 },
});
