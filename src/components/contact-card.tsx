// Who to call and which car to look for. Shown only on an accepted booking;
// the data comes from trip_contact(), which returns nothing otherwise.

import { useEffect, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';

import { Button, Label } from '@/components/ui';
import { formatPhone, telLink } from '@/lib/phone';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, fonts, space } from '@/theme/tokens';

type Contact = {
  first_name: string;
  phone: string | null;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
};

export function ContactCard({ bookingId }: { bookingId: string }) {
  const { t, lang } = useT();
  const [c, setC] = useState<Contact | null>(null);

  useEffect(() => {
    supabase
      .rpc('trip_contact', { p_booking_id: bookingId })
      .then(({ data }) => setC(((data as Contact[] | null) ?? [])[0] ?? null));
  }, [bookingId]);

  if (!c) return null;
  const f = fonts[lang];

  return (
    <View style={styles.card}>
      <Label>{t('contactTitle')}</Label>
      <Text style={[styles.name, { fontFamily: f.medium }]}>{c.first_name}</Text>
      {c.phone ? (
        // Numbers always read left to right, also inside Arabic.
        <Text selectable style={[styles.phone, { fontFamily: fonts.en.medium }]}>
          {'⁦' + formatPhone(c.phone) + '⁩'}
        </Text>
      ) : null}
      {c.plate ? (
        <View style={styles.car}>
          <Text style={[styles.carText, { fontFamily: f.regular }]}>
            {c.car_model} · {c.car_color}
          </Text>
          <Text style={[styles.plate, { fontFamily: fonts.en.bold }]}>{c.plate}</Text>
        </View>
      ) : null}
      {c.phone ? (
        <Button label={t('call')} onPress={() => Linking.openURL(telLink(c.phone!)).catch(() => {})} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: space.sm,
    paddingVertical: space.md,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
    borderBottomWidth: StyleSheet.hairlineWidth * 2,
    borderColor: colors.hairline,
  },
  name: { fontSize: 20, color: colors.ink },
  phone: { fontSize: 18, color: colors.ink, writingDirection: 'ltr' },
  car: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  carText: { fontSize: 15, color: colors.inkSecondary, flexShrink: 1 },
  // Plate looks like a plate: bordered, monospaced feel, left to right.
  plate: {
    fontSize: 16,
    color: colors.ink,
    borderWidth: 1.5,
    borderColor: colors.ink,
    borderRadius: 6,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    letterSpacing: 1,
    writingDirection: 'ltr',
  },
});
