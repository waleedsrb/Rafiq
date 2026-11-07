// Seats at a glance: filled = booked, outlined = asked for, dashed = free.

import { StyleSheet, View } from 'react-native';

import { Body, ltr } from '@/components/ui';
import { useT } from '@/lib/session';
import { colors, space } from '@/theme/tokens';

export function SeatDots({ total, booked, pending = 0 }: { total: number; booked: number; pending?: number }) {
  const { t } = useT();
  const dots = Array.from({ length: total }, (_, i) => (i < booked ? 'booked' : i < booked + pending ? 'pending' : 'free'));
  return (
    <View style={styles.row}>
      <View style={styles.dots}>
        {dots.map((kind, i) => (
          <View key={i} style={[styles.dot, styles[kind]]} />
        ))}
      </View>
      <Body muted small>
        {ltr(booked)} {t('seatsBookedOf')} {ltr(total)} {t('seatsBooked')}
      </Body>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dots: { flexDirection: 'row', gap: 4 },
  dot: { width: 18, height: 18, borderRadius: 9 },
  booked: { backgroundColor: colors.ink },
  pending: { borderWidth: 2, borderColor: colors.ink },
  free: { borderWidth: 1.5, borderColor: colors.lineStrong, borderStyle: 'dashed' },
});
