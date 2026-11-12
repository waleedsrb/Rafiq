// Driver: add or edit your car. Required before posting a trip
// (the database refuses a trip without one: see require_car()).

import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PlateArt } from '@/components/plate-art';
import { Body, Button, Field, Label, Screen, Title } from '@/components/ui';
import type { StringKey } from '@/i18n/strings';
import { goBack } from '@/lib/nav';
import { cache, prefetch } from '@/lib/cache';
import { normalizePlate } from '@/lib/plate';
import { carQuery, checkQuery } from '@/lib/queries';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';
import { useCached } from '@/lib/use-cached';
import { makeStyles } from '@/theme/theme';
import { space } from '@/theme/tokens';

// Common car colours as swatches; "another colour" opens a text field.
const SWATCHES: { key: StringKey; hex: string }[] = [
  { key: 'colorWhite', hex: '#FFFFFF' },
  { key: 'colorSilver', hex: '#C9CCD1' },
  { key: 'colorGray', hex: '#6E7178' },
  { key: 'colorBlack', hex: '#1B1C1F' },
  { key: 'colorBlue', hex: '#2D4F8F' },
  { key: 'colorRed', hex: '#9E2B2B' },
];

export default function Car() {
  const styles = useStyles();
  const { t } = useT();
  const { session } = useSession();
  const me = session?.user.id;
  // Account already loaded your car, so the form opens filled in (src/lib/cache.ts).
  const saved = useCached(me ? carQuery(me) : null).data;
  const [model, setModel] = useState(saved?.car_model ?? '');
  const [color, setColor] = useState(saved?.car_color ?? '');
  const [otherColor, setOtherColor] = useState(false);
  const [plate, setPlate] = useState(saved?.plate ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const swatchNames = SWATCHES.map((s) => t(s.key));

  // Opened before Account had an answer? Fill the form in when it lands (only once,
  // and never over something you've started typing).
  const filled = useRef(saved !== undefined);
  useEffect(() => {
    if (filled.current || saved === undefined) return;
    filled.current = true;
    if (!saved || model || color || plate) return;
    setModel(saved.car_model);
    setColor(saved.car_color);
    setPlate(saved.plate);
  }, [saved]); // eslint-disable-line react-hooks/exhaustive-deps

  // A saved colour that isn't one of the swatches shows in the text field.
  useEffect(() => {
    if (color && !swatchNames.includes(color)) setOtherColor(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [color === '']);

  const normalized = normalizePlate(plate);
  const valid = model.trim().length >= 2 && color.trim().length >= 2 && plate.trim().length > 0;

  async function save() {
    if (!session) return;
    if (!normalized) return setError(t('plateInvalid'));
    setSaving(true);
    setError(null);
    // upsert = insert, or update if this driver already has a row.
    const { error: err } = await supabase.from('driver_details').upsert({
      driver_id: session.user.id,
      car_model: model.trim(),
      car_color: color.trim(),
      plate: normalized,
      updated_at: new Date().toISOString(),
    });
    if (err) {
      setSaving(false);
      return setError(t('somethingWrong'));
    }
    // A new car (or a changed one) needs the driver check: go straight to its photos.
    const data = await cache.load(carQuery(session.user.id));
    // The driver check may need doing again; Account and the check page ask afresh.
    prefetch(checkQuery(session.user.id, 'driver'), 0);
    setSaving(false);
    if (data && !data.verified_at) router.replace({ pathname: '/verify', params: { kind: 'driver' } });
    else goBack();
  }

  return (
    <Screen back scroll footer={<Button label={t('saveCar')} onPress={save} loading={saving} disabled={!valid} />}>
      <Title>{t('carTitle')}</Title>
      <Body muted>{t('carHint')}</Body>

      <Field label={t('carModel')} value={model} onChangeText={setModel} placeholder={t('carModelPlaceholder')} maxLength={60} />

      <View style={{ gap: space.sm }}>
        <Label>{t('carColor')}</Label>
        <View style={styles.swatches}>
          {SWATCHES.map((s, i) => {
            const selected = !otherColor && color === swatchNames[i];
            return (
              <Pressable
                key={s.key}
                accessibilityRole="radio"
                accessibilityLabel={swatchNames[i]}
                accessibilityState={{ selected }}
                onPress={() => {
                  setOtherColor(false);
                  setColor(swatchNames[i]);
                }}
                style={[styles.swatchRing, selected && styles.swatchRingOn]}
              >
                <View style={[styles.swatch, { backgroundColor: s.hex }]} />
              </Pressable>
            );
          })}
          <Pressable
            accessibilityRole="radio"
            accessibilityLabel={t('otherColor')}
            accessibilityState={{ selected: otherColor }}
            onPress={() => {
              setOtherColor(true);
              if (swatchNames.includes(color)) setColor('');
            }}
            style={[styles.swatchRing, otherColor && styles.swatchRingOn]}
          >
            <View style={[styles.swatch, styles.swatchOther]}>
              <Icon name="plus" size={16} />
            </View>
          </Pressable>
        </View>
        {otherColor ? (
          <Field value={color} onChangeText={setColor} placeholder={t('otherColor')} maxLength={30} />
        ) : color ? (
          <Body muted small>
            {color}
          </Body>
        ) : null}
      </View>

      <Field
        label={t('plate')}
        ltr
        value={plate}
        onChangeText={(v) => {
          setPlate(v);
          setError(null);
        }}
        placeholder="7-1234-95"
        autoCapitalize="characters"
        autoCorrect={false}
        maxLength={14}
      />
      {normalized ? (
        <View style={styles.preview}>
          <PlateArt plate={normalized} width={220} />
          <Body muted small>
            {t('platePreviewHint')}
          </Body>
        </View>
      ) : null}

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}

const useStyles = makeStyles((colors) => ({
  swatches: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  swatchRing: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: 'transparent' },
  swatchRingOn: { borderColor: colors.ink },
  swatch: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.lineStrong },
  swatchOther: { backgroundColor: colors.sunken, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  preview: { alignItems: 'center', gap: space.sm, marginTop: space.sm },
}));
