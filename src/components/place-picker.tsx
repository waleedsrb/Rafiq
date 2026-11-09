// Place search for every "where" in the app (mockup screens 1 and 2 of "Whole West Bank").
// A sheet with a search field: before you type, the big cities; as you type, towns and
// villages from search_places() with their governorate, and places outside the West Bank
// at the end, faded and tagged. Those can't be picked: tapping one explains why.

import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DialogLayer } from '@/components/dialog-host';
import { Icon } from '@/components/icon';
import { useFont } from '@/components/ui';
import { notify } from '@/lib/dialog';
import { selectFeel } from '@/lib/haptics';
import { place, placeName } from '@/lib/places';
import { useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { colors, radii, sizes, space } from '@/theme/tokens';

type Hit = { id: string; name_ar: string; name_en: string; governorate: string | null; region: 'west_bank' | 'settlement' | 'jerusalem' | 'outside' };

// The governorate centres, shown before you type: most trips start or end in one.
// Ramallah, Nablus, Hebron, Jenin, Bethlehem, Tulkarm, Qalqilya, Jericho, Salfit, Tubas.
const CITIES = [
  'osm-n246843686', 'osm-n293546203', 'osm-n299937114', 'osm-n300254767', 'osm-a13519431',
  'osm-n2418943009', 'osm-n1567046521', 'osm-n432335269', 'osm-n256724756', 'osm-n332784789',
];

export function PlacePicker({
  visible,
  title,
  exclude,
  onPick,
  onClose,
}: {
  visible: boolean;
  title: string;
  /** The place already chosen for the other end, so it isn't offered twice. */
  exclude?: string;
  onPick: (id: string) => void;
  onClose: () => void;
}) {
  const { t, lang } = useT();
  const { f, rtl, direction } = useFont();
  const insets = useSafeAreaInsets();
  const [q, setQ] = useState('');
  const [hits, setHits] = useState<Hit[] | null>(null);
  const [loading, setLoading] = useState(false);
  const asked = useRef(0);
  const align = rtl ? ('right' as const) : ('left' as const);

  useEffect(() => {
    if (visible) {
      setQ('');
      setHits(null);
    }
  }, [visible]);

  // Ask the server a moment after the last key, and ignore answers to old questions.
  useEffect(() => {
    const text = q.trim();
    if (!text) {
      setHits(null);
      setLoading(false);
      return;
    }
    const ask = ++asked.current;
    setLoading(true);
    const timer = setTimeout(() => {
      supabase.rpc('search_places', { p_q: text, p_limit: 15 }).then(({ data }) => {
        if (ask !== asked.current) return;
        setHits(((data as Hit[] | null) ?? []).filter((h) => h.id !== exclude));
        setLoading(false);
      });
    }, 180);
    return () => clearTimeout(timer);
  }, [q, exclude]);

  const name = (h: Hit) => (lang === 'ar' ? h.name_ar : h.name_en);
  const governorate = (h: Hit) => {
    if (lang === 'ar') return place(h.id)?.governorate ?? '';
    return (h.governorate ?? '').replace(/ Governorate$/, '');
  };

  function pick(id: string) {
    selectFeel();
    onPick(id);
  }

  function blocked(h: Hit) {
    const key = h.region === 'settlement' ? 'settlementTitle' : h.region === 'jerusalem' ? 'jerusalemTitle' : 'outsideTitle';
    notify({ title: t(key).replace('{place}', name(h)), body: t('outsideBody'), ok: t('pickAnotherPlace'), tone: 'neutral' });
  }

  const inside = (hits ?? []).filter((h) => h.region === 'west_bank');
  const flagged = (hits ?? []).filter((h) => h.region !== 'west_bank');
  const flag = { settlement: t('flagSettlement'), jerusalem: t('flagJerusalem'), outside: t('flagOutside'), west_bank: '' };

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
        <Text style={[styles.rowTitle, { fontFamily: f.medium, textAlign: align }, faded && { color: colors.inkSecondary }]} numberOfLines={1}>
          {label}
        </Text>
        {sub ? <Text style={[styles.rowSub, { fontFamily: f.regular, textAlign: align }]} numberOfLines={1}>{sub}</Text> : null}
      </View>
      {faded ? (
        <View style={styles.flag}>
          <Text style={[styles.flagText, { fontFamily: f.medium }]}>{faded}</Text>
        </View>
      ) : null}
    </Pressable>
  );
  const group = (label: string) => <Text style={[styles.group, { fontFamily: f.medium, textAlign: align }]}>{label}</Text>;

  return (
    <Modal visible={visible} animationType="slide" presentationStyle={Platform.OS === 'ios' ? 'pageSheet' : undefined} onRequestClose={onClose}>
      <View style={[styles.sheet, { paddingTop: Platform.OS === 'ios' ? space.md : insets.top + space.sm, direction }]}>
        <View style={styles.head}>
          <Text style={[styles.title, { fontFamily: f.bold, textAlign: align }]}>{title}</Text>
          <Pressable accessibilityRole="button" accessibilityLabel={t('cancel')} onPress={onClose} hitSlop={8} style={styles.close}>
            <Icon name="x" size={20} />
          </Pressable>
        </View>
        <View style={styles.field}>
          <Icon name="search" size={18} color={colors.inkSecondary} />
          <TextInput
            autoFocus
            value={q}
            onChangeText={setQ}
            placeholder={t('searchTownPlaceholder')}
            placeholderTextColor={colors.inkSecondary}
            autoCorrect={false}
            returnKeyType="search"
            style={[styles.input, { fontFamily: f.regular, textAlign: align, writingDirection: direction }]}
          />
          {loading ? <ActivityIndicator size="small" color={colors.inkSecondary} /> : null}
        </View>

        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: insets.bottom + space.lg }}>
          {hits === null ? (
            <>
              {group(t('bigTowns'))}
              {CITIES.filter((id) => id !== exclude).map((id) => row(id, placeName(id, lang), '', () => pick(id)))}
            </>
          ) : (
            <>
              {inside.length ? group(t('townsAndVillages')) : null}
              {inside.map((h) => row(h.id, name(h), governorate(h), () => pick(h.id)))}
              {flagged.length ? group(t('outsideWestBank')) : null}
              {flagged.map((h) => row(h.id, name(h), '', () => blocked(h), flag[h.region]))}
              {!loading && hits.length === 0 ? <Text style={[styles.rowSub, { fontFamily: f.regular, textAlign: align, marginTop: space.md }]}>{t('noPlaceFound')}</Text> : null}
            </>
          )}
        </ScrollView>
      </View>
      <DialogLayer />
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, backgroundColor: colors.surface, paddingHorizontal: space.lg },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: space.md },
  title: { flex: 1, fontSize: 22, color: colors.ink },
  close: { width: sizes.touch, height: sizes.touch, borderRadius: sizes.touch / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.sunken },
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    height: sizes.button,
    paddingHorizontal: space.md,
    borderRadius: radii.capsule,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.hairline,
    marginBottom: space.sm,
  },
  input: { flex: 1, fontSize: 17, color: colors.ink, paddingVertical: 0 },
  group: { fontSize: 13, color: colors.inkSecondary, marginTop: space.md, marginBottom: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.hairline },
  rowIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.sunken, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { fontSize: 16, color: colors.ink },
  rowSub: { fontSize: 13, color: colors.inkSecondary },
  flag: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: radii.capsule, backgroundColor: colors.sunken },
  flagText: { fontSize: 12, color: colors.inkSecondary },
});
