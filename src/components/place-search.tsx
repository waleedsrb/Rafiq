// Place search in place (design A, "grow the bar you tapped"). Tapping From or To never
// opens a new page: the route itself grows into two fields, the one you tapped ready to
// type, and the town list takes the place of whatever was under it. Picking a town shrinks
// it back. Used by the search header (search-morph.tsx), the results screen and step 1 of
// Post a trip.
//
// Before you type: the big cities. As you type: towns and villages from search_places()
// with their governorate, then places outside the West Bank, faded and tagged. Those can't
// be picked: tapping one explains why.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { selectFeel, tapFeel } from '@/lib/haptics';
import { place, placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { colors, radii, space } from '@/theme/tokens';

export type End = 'origin' | 'destination';
type Region = 'west_bank' | 'settlement' | 'jerusalem' | 'outside';
type Hit = { id: string; name_ar: string; name_en: string; governorate: string | null; region: Region };

// Ramallah, Nablus, Hebron, Jenin, Bethlehem, Tulkarm, Qalqilya, Jericho, Salfit, Tubas.
const CITIES = [
  'osm-n246843686', 'osm-n293546203', 'osm-n299937114', 'osm-n300254767', 'osm-a13519431',
  'osm-n2418943009', 'osm-n1567046521', 'osm-n432335269', 'osm-n256724756', 'osm-n332784789',
];

/** Everything one place search needs: which end, what's typed, and the answer. */
export function usePlaceSearch() {
  const [end, setEnd] = useState<End | null>(null);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const asked = useRef(0);

  useEffect(() => {
    setQ('');
    setHits(null);
  }, [end]);

  // Ask the server a moment after the last key, and ignore answers to old questions.
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      asked.current++;
      setHits(null);
      setLoading(false);
      return;
    }
    const ask = ++asked.current;
    setLoading(true);
    const timer = setTimeout(() => {
      supabase.rpc('search_places', { p_q: text, p_limit: 15 }).then(({ data }) => {
        if (ask !== asked.current) return;
        setHits((data as Hit[] | null) ?? []);
        setLoading(false);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q]);

  return { end, open: (e: End) => setEnd(e), close: () => setEnd(null), q, setQ, hits, loading };
}
export type PlaceSearch = ReturnType<typeof usePlaceSearch>;

/**
 * The route as two fields: start (ring) over end (square). The active end is a text field
 * with the caret in it; the other shows its town and switches to it when tapped.
 */
export function PlaceFields({ search, origin, destination }: { search: PlaceSearch; origin: City; destination: City }) {
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
  const align = rtl ? ('right' as const) : ('left' as const);
  const field = (end: End) => {
    const value = end === 'origin' ? origin : destination;
    const label = t(end === 'origin' ? 'fromLabel' : 'toLabel');
    if (search.end === end) {
      return (
        <View key={end} style={[styles.field, styles.fieldOn, { direction }]}>
          <Icon name="search" size={16} color={colors.inkSecondary} />
          <TextInput
            autoFocus
            value={search.q}
            onChangeText={search.setQ}
            placeholder={placeName(value, lang) || t('searchTownPlaceholder')}
            placeholderTextColor={colors.inkSecondary}
            accessibilityLabel={`${label}: ${t('searchTownPlaceholder')}`}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.input, { fontFamily: f.medium, textAlign: align, writingDirection: direction }]}
          />
          {search.loading ? <ActivityIndicator size="small" color={colors.inkSecondary} /> : null}
        </View>
      );
    }
    return (
      <Pressable
        key={end}
        accessibilityRole="button"
        accessibilityLabel={`${label} ${placeName(value, lang)}`}
        onPress={() => {
          tapFeel();
          search.open(end);
        }}
        style={({ pressed }) => [styles.field, { direction }, pressed && { opacity: 0.6 }]}
      >
        <Text style={[styles.fieldText, { fontFamily: f.medium, textAlign: align }]} numberOfLines={1}>
          {placeName(value, lang)}
        </Text>
      </Pressable>
    );
  };
  return (
    <View style={[styles.fields, { direction }]}>
      <View style={styles.dots}>
        <View style={styles.dotStart} />
        <View style={styles.dotLine} />
        <View style={styles.dotEnd} />
      </View>
      <View style={{ flex: 1, gap: 6 }}>
        {field('origin')}
        {field('destination')}
      </View>
    </View>
  );
}

/**
 * The towns for what's typed (the big cities before typing). `onPick` gets a West Bank
 * place; the end at the other side is left out, so a route can't be A to A.
 */
export function PlaceResults({ search, exclude, onPick }: { search: PlaceSearch; exclude?: City; onPick: (id: City) => void }) {
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
  const align = rtl ? ('right' as const) : ('left' as const);
  const hits = search.hits?.filter((h) => h.id !== exclude) ?? null;
  const name = (h: Hit) => (lang === 'ar' ? h.name_ar : h.name_en);
  const governorate = (h: Hit) => (lang === 'ar' ? (place(h.id)?.governorate ?? '') : (h.governorate ?? '').replace(/ Governorate$/, ''));
  const flag: Record<Region, string> = { settlement: t('flagSettlement'), jerusalem: t('flagJerusalem'), outside: t('flagOutside'), west_bank: '' };

  const pick = (id: City) => {
    selectFeel();
    onPick(id);
  };
  const blocked = (h: Hit) => {
    const key = h.region === 'settlement' ? 'settlementTitle' : h.region === 'jerusalem' ? 'jerusalemTitle' : 'outsideTitle';
    notify({ title: t(key).replace('{place}', name(h)), body: t('outsideBody'), ok: t('pickAnotherPlace'), tone: 'neutral' });
  };

  const row = (key: string, label: string, sub: string, onPress: () => void, faded?: string) => (
    <Pressable
      key={key}
      accessibilityRole="button"
      accessibilityLabel={[label, sub, faded].filter(Boolean).join(', ')}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { direction }, pressed && { opacity: 0.6 }]}
    >
      <View style={styles.rowIcon}>
        <Icon name="mapPin" size={18} color={faded ? colors.inkSecondary : colors.ink} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[styles.rowTitle, { fontFamily: f.medium, textAlign: align }, faded ? { color: colors.inkSecondary } : null]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? (
          <Text style={[styles.rowSub, { fontFamily: f.regular, textAlign: align }]} numberOfLines={1}>
            {sub}
          </Text>
        ) : null}
      </View>
      {faded ? (
        <View style={styles.flag}>
          <Text style={[styles.flagText, { fontFamily: f.medium }]}>{faded}</Text>
        </View>
      ) : null}
    </Pressable>
  );
  const group = (label: string) => <Text style={[styles.group, { fontFamily: f.medium, textAlign: align }]}>{label}</Text>;

  if (hits === null) {
    return (
      <View>
        {group(t('bigTowns'))}
        {CITIES.filter((id) => id !== exclude).map((id) => row(id, placeName(id, lang), '', () => pick(id)))}
      </View>
    );
  }
  const inside = hits.filter((h) => h.region === 'west_bank');
  const flagged = hits.filter((h) => h.region !== 'west_bank');
  return (
    <View>
      {inside.length ? group(t('townsAndVillages')) : null}
      {inside.map((h) => row(h.id, name(h), governorate(h), () => pick(h.id)))}
      {flagged.length ? group(t('outsideWestBank')) : null}
      {flagged.map((h) => row(h.id, name(h), '', () => blocked(h), flag[h.region]))}
      {!search.loading && hits.length === 0 ? (
        <Text style={[styles.rowSub, { fontFamily: f.regular, textAlign: align, marginTop: space.md }]}>{t('noPlaceFound')}</Text>
      ) : null}
    </View>
  );
}

/** Height PlaceFields takes (two fields and the gap): the search header grows by this. */
export const PLACE_FIELDS_H = 44 * 2 + 6;

const styles = StyleSheet.create({
  fields: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  dots: { width: 20, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dotStart: { width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.card },
  dotLine: { width: 1.5, height: 30, backgroundColor: colors.lineStrong },
  dotEnd: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.ink },
  field: { height: 44, borderRadius: 22, backgroundColor: 'rgba(23,25,28,0.05)', paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldOn: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 12 },
  fieldText: { flex: 1, fontSize: 15, color: colors.ink },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  group: { fontSize: 13, color: colors.inkSecondary, marginTop: space.md, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, color: colors.ink },
  rowSub: { fontSize: 13, color: colors.inkSecondary },
  flag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.capsule, backgroundColor: colors.sunken },
  flagText: { fontSize: 12, color: colors.inkSecondary },
});
