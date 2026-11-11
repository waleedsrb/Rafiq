// Who to call and which car to look for. Shown only on an accepted booking;
// the data comes from trip_contact(), which returns nothing otherwise. Name and car come
// straight away; phone and plate only from opens_at (an hour before the trip).

import { useEffect, useState } from 'react';
import { Linking, Pressable, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon } from '@/components/icon';
import { PlateArt } from '@/components/plate-art';
import { ListRow, ltr } from '@/components/ui';
import { formatTime } from '@/lib/format';
import { formatPhone, telLink } from '@/lib/phone';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

export type Contact = {
  first_name: string;
  /** "Dana H.": full names are never shown to other people. */
  name: string;
  phone: string | null;
  car_model: string | null;
  car_color: string | null;
  plate: string | null;
  /** When phone and plate appear. */
  opens_at: string;
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
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const waiting = !c.phone && new Date(c.opens_at).getTime() > Date.now();
  return (
    <View>
      <ListRow
        leading={<Avatar path={avatarPath} name={c.name} seed={seed} />}
        title={c.name}
        subtitle={
          c.phone
            ? ltr(formatPhone(c.phone))
            : waiting
              ? t('phonePlateAt').replace('{time}', ltr(formatTime(new Date(c.opens_at), lang)))
              : t('driverLabel')
        }
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

const useStyles = makeStyles((colors) => ({
  call: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' },
  plateRow: { paddingVertical: space.md, borderBottomWidth: 1, borderBottomColor: colors.hairline, alignItems: 'flex-start' },
}));

/** Loads the contact for one accepted booking, then shows it. */
export function BookingContact({ bookingId, avatarPath, seed }: { bookingId: string; avatarPath?: string | null; seed?: string | null }) {
  const c = useContact(bookingId);
  return c ? <ContactCard contact={c} avatarPath={avatarPath} seed={seed} /> : null;
}
