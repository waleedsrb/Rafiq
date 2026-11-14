// Place search in place (design A, "grow the bar you tapped"). Tapping From or To never
// opens a new page: the route itself grows into two fields, the one you tapped ready to
// type, and the town list takes the place of whatever was under it. Picking a town shrinks
// it back. Used by the search header (search-layer.tsx), the results screen and step 1 of
// Post a trip.
//
// Before you type: the big cities. As you type: towns and villages from search_places()
// with their governorate, then places outside the West Bank, faded and tagged. Those can't
// be picked: tapping one explains why.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Icon } from '@/components/icon';
import { inputAlign, useFont } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { selectFeel, tapFeel } from '@/lib/haptics';
import { place, placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import type { City } from '@/lib/trip-form';
import { BAR_TEXT_MAX, useOneLine } from '@/theme/text-size';
import { makeStyles, useTheme } from '@/theme/theme';
import { radii, space } from '@/theme/tokens';

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
export function PlaceFields({
  search,
  origin,
  destination,
  onBlur,
}: {
  search: PlaceSearch;
  origin: City;
  destination: City;
  /** The field lost its caret (a tap outside it, the keyboard's own dismiss). */
  onBlur?: () => void;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
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
            onBlur={onBlur}
            // The two fields are a fixed 44pt each (the search bar grows into them), so text grows only so far.
            maxFontSizeMultiplier={BAR_TEXT_MAX}
            style={[styles.input, { fontFamily: f.medium, textAlign: inputAlign(rtl), writingDirection: direction }]}
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
        <Text style={[styles.fieldText, { fontFamily: f.medium }]} numberOfLines={1} maxFontSizeMultiplier={BAR_TEXT_MAX}>
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
export function PlaceResults({
  search,
  exclude,
  onPick,
  recent,
  current,
}: {
  search: PlaceSearch;
  exclude?: City;
  onPick: (id: City) => void;
  /** Towns picked lately, listed first before you type. */
  recent?: City[];
  /** The town this end has now: marked with a check. */
  current?: City;
}) {
  const { c: colors } = useTheme();
  const styles = useStyles();
  const { t, lang } = useT();
  const { f, direction } = useFont();
  const one = useOneLine();
  const hits = search.hits?.filter((h) => h.id !== exclude) ?? null;
  const name = (h: Hit) => (lang === 'ar' ? h.name_ar : h.name_en);
  const governorate = (h: Hit) => (lang === 'ar' ? (place(h.id)?.governorate ?? '') : (h.governorate ?? '').replace(/ Governorate$/, ''));
  const flag: Record<Region, string> = { settlement: t('flagSettlement'), jerusalem: t('flagJerusalem'), outside: t('flagOutside'), west_bank: '' };
  // While typing, the first town is what the keyboard's Return key picks: it is lit.
  const typed = search.q.trim();
  const top = topPick(search, exclude);

  const pick = (id: City) => {
    selectFeel();
    onPick(id);
  };
  const blocked = (h: Hit) => {
    const key = h.region === 'settlement' ? 'settlementTitle' : h.region === 'jerusalem' ? 'jerusalemTitle' : 'outsideTitle';
    notify({ title: t(key).replace('{place}', name(h)), body: t('outsideBody'), ok: t('pickAnotherPlace'), tone: 'neutral' });
  };

  // What's typed is drawn bolder inside the town's name, so you can see why it matched.
  const title = (label: string, faded?: string) => {
    const at = typed ? label.toLocaleLowerCase().indexOf(typed.toLocaleLowerCase()) : -1;
    const base = [styles.rowTitle, { fontFamily: typed ? f.regular : f.medium }, faded ? { color: colors.inkSecondary } : null];
    if (at < 0) {
      return (
        <Text style={[styles.rowTitle, { fontFamily: f.medium }, faded ? { color: colors.inkSecondary } : null]} numberOfLines={one}>
          {label}
        </Text>
      );
    }
    return (
      <Text style={base} numberOfLines={one}>
        {label.slice(0, at)}
        <Text style={{ fontFamily: f.bold }}>{label.slice(at, at + typed.length)}</Text>
        {label.slice(at + typed.length)}
      </Text>
    );
  };

  const row = (
    key: string,
    id: string,
    label: string,
    sub: string,
    onPress: () => void,
    opts: { faded?: string; icon?: 'mapPin' | 'clock'; last?: boolean } = {},
  ) => {
    const lit = !!typed && id === top;
    const chosen = id === current;
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityState={{ selected: chosen }}
        accessibilityLabel={[label, sub, opts.faded].filter(Boolean).join(', ')}
        onPress={onPress}
        style={({ pressed }) => [styles.row, { direction }, lit && styles.rowLit, pressed && styles.rowPressed]}
      >
        <View style={[styles.rowIcon, lit && styles.rowIconLit]}>
          <Icon name={opts.icon ?? 'mapPin'} size={18} color={opts.faded ? colors.inkSecondary : colors.ink} />
        </View>
        <View style={[styles.rowText, opts.last || lit ? styles.rowTextLast : null]}>
          <View style={{ flex: 1, gap: 1 }}>
            {title(label, opts.faded)}
            {sub ? (
              <Text style={[styles.rowSub, { fontFamily: f.regular }]} numberOfLines={one}>
                {sub}
              </Text>
            ) : null}
          </View>
          {opts.faded ? (
            <View style={styles.flag}>
              <Text style={[styles.flagText, { fontFamily: f.medium }]}>{opts.faded}</Text>
            </View>
          ) : chosen ? (
            <Icon name="check" size={18} color={colors.ink} />
          ) : null}
        </View>
      </Pressable>
    );
  };
  const group = (label: string) => <Text style={[styles.group, { fontFamily: f.medium }]}>{label}</Text>;

  if (hits === null) {
    const lately = (recent ?? []).filter((id) => id !== exclude && !!place(id));
    const cities = CITIES.filter((id) => id !== exclude && !lately.includes(id));
    return (
      <View>
        {lately.length ? group(t('recentPlaces')) : null}
        {lately.map((id, i) => row(`r-${id}`, id, placeName(id, lang), '', () => pick(id), { icon: 'clock', last: i === lately.length - 1 }))}
        {group(t('bigTowns'))}
        {cities.map((id, i) => row(id, id, placeName(id, lang), '', () => pick(id), { last: i === cities.length - 1 }))}
      </View>
    );
  }
  const inside = hits.filter((h) => h.region === 'west_bank');
  const flagged = hits.filter((h) => h.region !== 'west_bank');
  return (
    <View>
      {inside.length ? group(t('townsAndVillages')) : null}
      {inside.map((h, i) => row(h.id, h.id, name(h), governorate(h), () => pick(h.id), { last: i === inside.length - 1 }))}
      {flagged.length ? group(t('outsideWestBank')) : null}
      {flagged.map((h, i) => row(h.id, h.id, name(h), '', () => blocked(h), { faded: flag[h.region], last: i === flagged.length - 1 }))}
      {!search.loading && hits.length === 0 ? (
        <Text style={[styles.rowSub, { fontFamily: f.regular, marginTop: space.md }]}>{t('noPlaceFound')}</Text>
      ) : null}
    </View>
  );
}

/** The town the keyboard's Return key picks: the first West Bank match for what's typed. */
export function topPick(search: PlaceSearch, exclude?: City): City | null {
  if (!search.q.trim() || !search.hits) return null;
  return search.hits.find((h) => h.region === 'west_bank' && h.id !== exclude)?.id ?? null;
}

/** Height PlaceFields takes (two fields and the gap): the search header grows by this. */
export const PLACE_FIELDS_H = 44 * 2 + 6;

const useStyles = makeStyles((colors) => ({
  fields: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
  dots: { width: 20, alignItems: 'center', justifyContent: 'center', gap: 3 },
  dotStart: { width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: colors.ink, backgroundColor: colors.card },
  dotLine: { width: 1.5, height: 30, backgroundColor: colors.lineStrong },
  dotEnd: { width: 10, height: 10, borderRadius: 2, backgroundColor: colors.ink },
  field: { height: 44, borderRadius: 22, backgroundColor: colors.fill, paddingHorizontal: 14, flexDirection: 'row', alignItems: 'center', gap: 8 },
  fieldOn: { backgroundColor: colors.card, borderWidth: 2, borderColor: colors.ink, paddingHorizontal: 12 },
  fieldText: { flex: 1, fontSize: 15, color: colors.ink },
  input: { flex: 1, fontSize: 15, color: colors.ink, paddingVertical: 0 },
  group: { fontSize: 13, color: colors.inkSecondary, marginTop: space.lg, marginBottom: space.xs },
  // Rows sit a little in from the list's edges, so the lit row's soft fill has room around
  // its text; the separator starts after the icon (iOS list style).
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingStart: 6, minHeight: 56, borderRadius: 16, marginHorizontal: -6 },
  rowLit: { backgroundColor: colors.fill },
  rowPressed: { backgroundColor: colors.fill },
  rowText: {
    flex: 1,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingEnd: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.hairline,
  },
  rowTextLast: { borderBottomWidth: 0 },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  rowIconLit: { backgroundColor: colors.card },
  rowTitle: { fontSize: 16, color: colors.ink },
  rowSub: { fontSize: 13, color: colors.inkSecondary },
  flag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.capsule, backgroundColor: colors.sunken },
  flagText: { fontSize: 12, color: colors.inkSecondary },
}));
