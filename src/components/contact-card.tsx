// Who to call and which car to look for. Shown only on an accepted booking;
// the data comes from trip_contact(), which returns nothing otherwise.

import { useEffect, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { PlateArt } from '@/components/plate-art';
import { ListRow, ltr } from '@/components/ui';
import { formatPhone, telLink } from '@/lib/phone';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

export type Contact = {
  first_name: string;
  phone: string | null;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
};

export function useContact(bookingId: string | null) {
  const [c, setC] = useState<Contact | null>(null);
  useEffect(() => {
    if (!bookingId) return;
    supabase
      .rpc('trip_contact', { p_booking_id: bookingId })
      .then(({ data }) => setC(((data as Contact[] | null) ?? [])[0] ?? null));
  }, [bookingId]);
  return c;
}

export function ContactCard({ contact: c, avatarPath, seed }: { contact: Contact; avatarPath?: string | null; seed?: string | null }) {
  const { t } = useT();
  return (
    <View>
      <ListRow
        leading={<Avatar path={avatarPath} name={c.first_name} seed={seed} />}
        title={c.first_name}
        subtitle={c.phone ? ltr(formatPhone(c.phone)) : t('driverLabel')}
        trailing={
          c.phone ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('call')}
              onPress={() => Linking.openURL(telLink(c.phone!)).catch(() => {})}
              style={styles.call}
            >
              <Icon name="phone" size={20} color={colors.onInk} />
            </Pressable>
          ) : undefined
        }
      />
      {c.car_model ? (
        <ListRow
          last={!c.plate}
          icon="carProfile"
          title={c.car_model}
          subtitle={c.car_color ?? undefined}
        />
      ) : null}
      {c.plate ? (
        <View style={styles.plateRow}>
          <PlateArt plate={c.plate} width={170} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  plateRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline, alignItems: 'flex-start' },
});

/** Loads the contact for one accepted booking, then shows it. */
export function BookingContact({ bookingId, avatarPath, seed }: { bookingId: string; avatarPath?: string | null; seed?: string | null }) {
  const c = useContact(bookingId);
  return c ? <ContactCard contact={c} avatarPath={avatarPath} seed={seed} /> : null;
}
