// Someone's page: what you'd want to know before riding with them. Name, how long
// they've been on Rafiq or driving, what was checked, their numbers, their car (never
// the plate: that comes after acceptance), and what others said.
//
// Shown on its own screen (from a seat request) and as a step inside the trip card
// (tap the driver on Trip details).

import { Text, View } from 'react-native';

import { Avatar } from '@/components/avatar';
import { Icon, type IconName } from '@/components/icon';
import { Stars } from '@/components/stars';
import { Skeleton, SkeletonGroup, SkeletonList } from '@/components/skeleton';
import { StatsRow, StatsRowSkeleton } from '@/components/stats-row';
import { Body, IconCircle, Label, ListRow, useFont } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { useT } from '@/lib/session';
import { personQuery, statsQuery, type Review } from '@/lib/queries';
import { useCachedHere } from '@/lib/use-cached';
import { makeStyles, useTheme } from '@/theme/theme';
import { space } from '@/theme/tokens';

/** Someone's page as a block: on its own screen (/people/[id]) or inside the trip card. */
export function PersonProfile({ id }: { id: string }) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f } = useFont();
  // Cached by person (src/lib/cache.ts): opening the same driver again is instant.
  const loaded = useCachedHere(id ? personQuery(id) : null);
  const statsRes = useCachedHere(id ? statsQuery(id) : null);
  const person = loaded.data?.profile ?? null;
  const avatarPath = loaded.data?.avatarPath ?? null;
  const reviews = loaded.data?.reviews ?? null;
  const stats = statsRes.data ?? null;

  if (!person) return loaded.data === undefined && !loaded.failed ? <PersonSkeleton /> : null;

  const month = (iso: string) =>
    new Intl.DateTimeFormat(lang === 'ar' ? 'ar-u-nu-latn' : 'en-GB', {
      month: 'long',
      year: 'numeric',
    }).format(new Date(iso));
  const isDriver = !!person.car_model;
  const name = person.deleted ? t('deletedPerson') : person.name;
  const since =
    isDriver && person.driving_since
      ? `${t('drivingSince')} ${month(person.driving_since)}`
      : `${t('onRafiqSince')} ${month(person.member_since)}`;

  const badges: [IconName, StringKey][] = [];
  if (person.founding_driver) badges.push(['steeringWheel', 'foundingDriver']);
  if (person.id_verified) badges.push(['identificationCard', 'idVerifiedBadge']);
  if (person.driver_verified) badges.push(['sealCheck', 'driverCheckBadge']);

  return (
    <View style={{ gap: space.md }}>
      <View style={styles.header}>
        <Avatar path={person.deleted ? null : avatarPath} name={name} seed={person.deleted ? null : id} size={72} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={styles.nameLine}>
            <Text style={[styles.name, { fontFamily: f.bold }]}>{name}</Text>
            {person.id_verified ? <Icon name="sealCheck" size={20} color={colors.statusOpen} /> : null}
          </View>
          {person.deleted ? null : <Text style={[styles.meta, { fontFamily: f.regular }]}>{since}</Text>}
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

      {stats ? <StatsRow stats={stats} /> : statsRes.data === undefined && !statsRes.failed ? <StatsRowSkeleton /> : null}

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
    </View>
  );
}

/** The page's shape while it loads: photo and name, the numbers, a few reviews. */
function PersonSkeleton() {
  const styles = useStyles();
  return (
    <View style={{ gap: space.md }}>
      <SkeletonGroup style={styles.header}>
        <Skeleton width={72} height={72} radius={36} />
        <View style={{ flex: 1, gap: 10 }}>
          <Skeleton width="55%" height={20} />
          <Skeleton width="40%" height={12} />
        </View>
      </SkeletonGroup>
      <StatsRowSkeleton />
      <SkeletonList rows={3} />
    </View>
  );
}

function ReviewRow({ review, last }: { review: Review; last: boolean }) {
  const styles = useStyles();
  const { t, lang } = useT();
  const { f } = useFont();
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
          <Text style={[styles.reviewText, { fontFamily: f.regular }]}>{words.join(' · ')}</Text>
        ) : null}
      </View>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
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
}));
