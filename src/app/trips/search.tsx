// Where to: pick the direction, the day and (optionally) the part of the day.
// Results open on their own screen, as in the mockups.

import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { RouteCard } from '@/components/route-card';
import { Button, ChipRow, Choice, Label, Screen } from '@/components/ui';
import { formatChipDay, type DayPart } from '@/lib/format';
import { useT } from '@/lib/session';
import type { City } from '@/lib/trip-form';
import { space } from '@/theme/tokens';

export default function WhereTo() {
  const { t, lang } = useT();
  const [origin, setOrigin] = useState<City>('ramallah');
  const [day, setDay] = useState(0);
  const [part, setPart] = useState<DayPart | null>(null);
  const destination: City = origin === 'ramallah' ? 'nablus' : 'ramallah';

  const days = useMemo(() => {
    const now = new Date();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(now);
      d.setDate(d.getDate() + i);
      const label = i === 0 ? t('today') : i === 1 ? t('tomorrow') : formatChipDay(d, lang);
      return { value: i, label };
    });
  }, [t, lang]);

  const swap = () => setOrigin(destination);

  return (
    <Screen
      back
      footer={
        <Button
          label={t('searchTrips')}
          onPress={() =>
            router.push({
              pathname: '/trips/results',
              params: { origin, destination, day: String(day), ...(part ? { part } : {}) },
            })
          }
        />
      }
    >
      <RouteCard origin={origin} destination={destination} onSwap={swap} />

      <View style={{ gap: space.sm, marginTop: space.md }}>
        <Label>{t('whenLabel')}</Label>
        <ChipRow value={day} onChange={setDay} options={days} />
      </View>
      <Choice
        value={part}
        // Tap the chosen part again to search the whole day.
        onChange={(v) => setPart((p) => (p === v ? null : v))}
        options={[
          { value: 'morning', label: t('partMorning') },
          { value: 'afternoon', label: t('partAfternoon') },
          { value: 'evening', label: t('partEvening') },
        ]}
      />
    </Screen>
  );
}
