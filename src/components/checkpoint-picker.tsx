// Checkpoints on the way: the driver ticks the ones the trip goes through. Used in Post a
// trip (step 3 of 5) and in "Change my way" on the driver's trip.
//
// The ones near the straight line between the pickup and the destination come ticked; the
// ones a little further out are listed below, unticked, for roads that wind (src/lib/way.ts).
// Each shows its status now, so a closed one stands out and is easy to leave off.

import { useMemo } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { STATUS_LOOK, BarricadeMark } from '@/components/checkpoint-badge';
import { Icon } from '@/components/icon';
import { useMapCheckpoints, type MapCheckpoint } from '@/components/route-map';
import { Body, ListRow, SectionTitle } from '@/components/ui';
import { selectFeel } from '@/lib/haptics';
import { centrePoint, type LatLng } from '@/lib/places';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { checkpointsNear, inDrivingOrder } from '@/lib/way';
import { colors } from '@/theme/tokens';

/** What the picker offers for a trip: `suggested` (start ticked) and `nearby`, in driving order. */
export function useWayChoices(origin: City, destination: City, start?: LatLng | null) {
  const all = useMapCheckpoints(60_000);
  const from = start ?? centrePoint(origin);
  const to = centrePoint(destination);
  return useMemo(() => ({ all, from, to, ...checkpointsNear(from, to, all) }), [all, from.latitude, from.longitude, to.latitude, to.longitude]); // eslint-disable-line react-hooks/exhaustive-deps
}
export type WayChoices = ReturnType<typeof useWayChoices>;

export function CheckpointPicker({ choices, value, onChange }: { choices: WayChoices; value: string[]; onChange: (ids: string[]) => void }) {
  const { t } = useT();
  const chosen = new Set(value);
  // Ticked ones first (also any picked from further away), then the rest of the suggestions, then nearby.
  const ticked = inDrivingOrder(choices.from, choices.to, choices.all.filter((c) => chosen.has(c.id)));
  const offered = [...choices.suggested, ...choices.nearby].filter((c) => !chosen.has(c.id));
  const toggle = (id: string) => {
    selectFeel();
    onChange(chosen.has(id) ? value.filter((v) => v !== id) : [...value, id]);
  };

  const row = (c: MapCheckpoint, on: boolean, last: boolean) => (
    <ListRow
      key={c.id}
      last={last}
      leading={<BarricadeMark status={c.status} size={36} />}
      title={c.name}
      subtitle={
        c.status ? (
          <Body small style={{ color: c.status === 'closed' ? colors.statusClosed : colors.inkSecondary }}>
            {t(STATUS_LOOK[c.status].word)}
            {c.status === 'closed' && on ? ` · ${t('closedOnWayHint')}` : ''}
          </Body>
        ) : (
          t('noRecentReports')
        )
      }
      trailing={<Tick on={on} label={c.name} onPress={() => toggle(c.id)} />}
      onPress={() => toggle(c.id)}
    />
  );

  return (
    <View>
      <Body muted small>
        {t('wayHint')}
      </Body>
      {ticked.length ? (
        <>
          <SectionTitle>{t('wayTicked')}</SectionTitle>
          {ticked.map((c, i) => row(c, true, i === ticked.length - 1))}
        </>
      ) : (
        <Body small style={styles.none}>
          {t('wayNone')}
        </Body>
      )}
      {offered.length ? (
        <>
          <SectionTitle>{t('wayNearby')}</SectionTitle>
          {offered.map((c, i) => row(c, false, i === offered.length - 1))}
        </>
      ) : null}
    </View>
  );
}

function Tick({ on, label, onPress }: { on: boolean; label: string; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={10}
      style={[styles.tick, on && styles.tickOn]}
    >
      {on ? <Icon name="check" size={16} color={colors.card} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tick: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: colors.lineStrong, alignItems: 'center', justifyContent: 'center' },
  tickOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  none: { marginVertical: 12, color: colors.inkSecondary },
});
