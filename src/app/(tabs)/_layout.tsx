// The four tabs, on the system's own tab bar: real Liquid Glass on iOS 26
// (it floats, refracts what scrolls under it and shrinks on scroll), Material on Android.
// Icons are our Phosphor icons as template images: outline, Fill when selected.

import { NativeTabs } from 'expo-router/native-tabs';
import { useCallback, useEffect, useState } from 'react';

import { prefetch } from '@/lib/cache';
import { useBookingChanges } from '@/lib/live';
import { carQuery, checkQuery, checkpointsQuery, detailsQuery, followsQuery, inboxQuery, myTripsQuery, statsQuery } from '@/lib/queries';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/theme/theme';
import { fonts } from '@/theme/tokens';

export default function TabsLayout() {
  const { c: colors } = useTheme();
  const { t, lang } = useT();
  const waiting = useRequestsWaiting();
  usePrefetchTabs();
  return (
    <NativeTabs
      tintColor={colors.ink}
      iconColor={{ default: colors.inkSecondary, selected: colors.ink }}
      labelStyle={{ fontFamily: fonts[lang].medium, fontSize: 11 }}
      badgeBackgroundColor={colors.clay}
      minimizeBehavior="onScrollDown"
    >
      <NativeTabs.Trigger name="home">
        <NativeTabs.Trigger.Icon
          src={{ default: require('../../../assets/tabs/house.png'), selected: require('../../../assets/tabs/house-fill.png') }}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>{t('tabHome')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="trips/mine">
        <NativeTabs.Trigger.Icon
          src={{ default: require('../../../assets/tabs/ticket.png'), selected: require('../../../assets/tabs/ticket-fill.png') }}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>{t('tabTrips')}</NativeTabs.Trigger.Label>
        {/* Clay = something needs you: seat requests waiting for your answer. */}
        {waiting > 0 ? <NativeTabs.Trigger.Badge>{String(waiting)}</NativeTabs.Trigger.Badge> : null}
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="checkpoints/index">
        <NativeTabs.Trigger.Icon
          src={{
            default: require('../../../assets/tabs/barricade.png'),
            selected: require('../../../assets/tabs/barricade-fill.png'),
          }}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>{t('tabCheckpoints')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="account">
        <NativeTabs.Trigger.Icon
          src={{ default: require('../../../assets/tabs/user.png'), selected: require('../../../assets/tabs/user-fill.png') }}
          renderingMode="template"
        />
        <NativeTabs.Trigger.Label>{t('tabProfile')}</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

/**
 * Once Home has drawn, load what the other tabs show (and what Account's pages need) in
 * the background, so the first tap on My trips, Checkpoints or Account is already filled
 * in instead of empty for a moment. Small reads, once per sign-in.
 */
function usePrefetchTabs() {
  const { session } = useSession();
  const me = session?.user.id;
  useEffect(() => {
    if (!me) return;
    // A short wait lets Home's own reads go first.
    const timer = setTimeout(() => {
      prefetch(myTripsQuery(me));
      prefetch(checkpointsQuery());
      prefetch(followsQuery(me));
      prefetch(inboxQuery(me));
      prefetch(carQuery(me));
      prefetch(detailsQuery(me));
      prefetch(statsQuery(me));
      prefetch(checkQuery(me, 'passenger'));
      prefetch(checkQuery(me, 'driver'));
    }, 800);
    return () => clearTimeout(timer);
  }, [me]);
}

/** How many seat requests on your upcoming trips are waiting for your answer. */
function useRequestsWaiting() {
  const { session } = useSession();
  const [count, setCount] = useState(0);
  const load = useCallback(() => {
    if (!session) return;
    supabase
      .from('bookings')
      .select('id, trips!inner(driver_id, departs_at, cancelled_at)', { count: 'exact', head: true })
      .eq('status', 'requested')
      .eq('trips.driver_id', session.user.id)
      .is('trips.cancelled_at', null)
      .gte('trips.departs_at', new Date().toISOString())
      .then(({ count: n }) => setCount(n ?? 0));
  }, [session]);
  useEffect(load, [load]);
  useBookingChanges(load);
  return count;
}
