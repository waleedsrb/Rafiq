// Someone's page: what you'd want to know before riding with them. Name, how long
// they've been on Rafiq or driving, what was checked, their numbers, their car (never
// the plate: that comes after acceptance), and what others said.
//
// Opened from Trip details (the driver) and from a seat request (the passenger).

import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { Stars } from '@/components/stars';
import { StatsRow } from '@/components/stats-row';
import { Body, IconCircle, Label, ListRow, Screen, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { shortName } from '@/lib/names';
import { useT } from '@/lib/session';
import type { Stats } from '@/lib/stats';
import { supabase } from '@/lib/supabase';
import { colors, space } from '@/theme/tokens';

type PublicProfile = {
  full_name: string;
  id_verified: boolean;
  member_since: string;
  deleted: boolean;
  car_model: string | null;
  car_color: string | null;
  driver_verified: boolean;
  driving_since: string | null;
  founding_driver: boolean;
};

type Review = {
  stars: number;
  tags: string[] | null;
  note: string | null;
  created_at: string;
  rater_first_name: string;
};

export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const [person, setPerson] = useState<PublicProfile | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [reviews, setReviews] = useState<Review[] | null>(null);

  useEffect(() => {
    if (!id) return;
    supabase.rpc('public_profile', { p_person: id }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setPerson((row as PublicProfile | undefined) ?? null);
    });
    supabase.rpc('person_stats', { p_person: id }).then(({ data }) => {
      const row = Array.isArray(data) ? data[0] : data;
      setStats((row as Stats | undefined) ?? null);
    });
    supabase.rpc('person_reviews', { p_person: id, p_limit: 20 }).then(({ data }) => setReviews((data as Review[] | null) ?? []));
  }, [id]);

  if (!person) return <Screen back>{null}</Screen>;

  const month = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  const isDriver = !!person.car_model;
  const name = person.deleted ? t('deletedPerson') : shortName(person.full_name);
  const since =
    isDriver && person.driving_since
      ? `${t('drivingSince')} ${month(person.driving_since)}`
      : `${t('onRafiqSince')} ${month(person.member_since)}`;
  const align = { textAlign: rtl ? ('right' as const) : ('left' as const) };

  const badges: [IconName, StringKey][] = [];
  if (person.founding_driver) badges.push(['steeringWheel', 'foundingDriver']);
  if (person.id_verified) badges.push(['identificationCard', 'idVerifiedBadge']);
  if (person.driver_verified) badges.push(['sealCheck', 'driverCheckBadge']);

  return (
    <Screen back scroll>
      <View style={styles.header}>
        <IconCircle letter={name.charAt(0)} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, { fontFamily: f.bold }, align]}>{name}</Text>
            {person.id_verified ? <Icon name="sealCheck" size={20} color={colors.statusOpen} /> : null}
          </View>
          {person.deleted ? null : <Text style={[styles.meta, { fontFamily: f.regular }, align]}>{since}</Text>}
        </View>
      </View>

      {badges.length > 0 ? (
        <View style={styles.badges}>
          {badges.map(([icon, key]) => (
            <View key={key} style={styles.badge}>
              <Icon name={icon} size={14} color={colors.statusOpen} />
              <Text style={[styles.badgeText, { fontFamily: f.medium }]}>{t(key)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {stats ? <StatsRow stats={stats} /> : null}

      {isDriver ? (
        <ListRow
          last
          icon="carProfile"
          title={[person.car_color, person.car_model].filter(Boolean).join(' ')}
          subtitle={t('plateAfterAccept')}
        />
      ) : null}

      <View style={{ gap: space.sm }}>
        <View style={styles.sectionHead}>
          <Label>{t('whatPeopleSay')}</Label>
          {stats && stats.rating_count > 0 ? (
            <Body muted small>
              {stats.rating_count} {t('reviewsCount')}
            </Body>
          ) : null}
        </View>
        {reviews === null ? null : reviews.length === 0 ? (
          <Body muted>{t('noReviewsYet')}</Body>
        ) : (
          reviews.map((r, i) => <ReviewRow key={`${r.created_at}-${i}`} review={r} last={i === reviews.length - 1} />)
        )}
      </View>
    </Screen>
  );
}

function ReviewRow({ review, last }: { review: Review; last: boolean }) {
  const { t, lang } = useT();
  const { f, rtl } = useFont();
  const when = new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', { day: 'numeric', month: 'short' }).format(
    new Date(review.created_at),
  );
  // Tags are the quick chips from rating (on time, safe driving…); a note only shows to the person rated.
  const words = (review.tags ?? []).map((tag) => t(`tag_${tag}` as StringKey));
  if (review.note) words.push(review.note);
  return (
    <View style={[styles.review, !last && styles.reviewLine]}>
      <IconCircle letter={review.rater_first_name.charAt(0)} size={32} />
      <View style={{ flex: 1, gap: 4 }}>
        <View style={styles.reviewHead}>
          <Text style={[styles.reviewName, { fontFamily: f.medium }]}>{review.rater_first_name}</Text>
          <Text style={[styles.meta, { fontFamily: f.regular }]}>{when}</Text>
        </View>
        <Stars value={review.stars} size={12} />
        {words.length > 0 ? (
          <Text style={[styles.reviewText, { fontFamily: f.regular, textAlign: rtl ? 'right' : 'left' }]}>{words.join(' · ')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    paddingTop: space.md,
  },
  nameLine: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 22, lineHeight: 28, color: colors.ink, flexShrink: 1 },
  meta: { fontSize: 13, lineHeight: 18, color: colors.inkSecondary },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: colors.sunken,
  },
  badgeText: { fontSize: 13, color: colors.ink },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  review: { flexDirection: 'row', gap: 12, paddingVertical: 12 },
  reviewLine: { borderBottomWidth: 1, borderColor: colors.hairline },
  reviewHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  reviewName: { fontSize: 15, color: colors.ink },
  reviewText: { fontSize: 14, lineHeight: 20, color: colors.inkSecondary },
});
