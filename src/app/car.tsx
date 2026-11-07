// Driver: add or edit your car. Required before posting a trip
// (the database refuses a trip without one: see require_car()).

import { router } from 'expo-router';
import { useEffect, useState } from 'react';

import { Body, Button, Field, Label, Screen, Title } from '@/components/ui';
import { normalizePlate } from '@/lib/plate';
import { useSession, useT } from '@/lib/session';
import { supabase } from '@/lib/supabase';

export default function Car() {
  const { t } = useT();
  const { session } = useSession();
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Fill in the form if the car is already saved.
  useEffect(() => {
    if (!session) return;
    supabase
      .from('driver_details')
      .select('car_model, car_color, plate')
      .eq('driver_id', session.user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setModel(data.car_model);
        setColor(data.car_color);
        setPlate(data.plate);
      });
  }, [session]);

  const valid = model.trim().length >= 2 && color.trim().length >= 2 && plate.trim().length > 0;

  async function save() {
    if (!session) return;
    const normalized = normalizePlate(plate);
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
    setSaving(false);
    if (err) return setError(t('somethingWrong'));
    router.back();
  }

  return (
    <Screen scroll footer={<Button label={t('save')} onPress={save} loading={saving} disabled={!valid} />}>
      <Title>{t('carTitle')}</Title>
      <Body muted>{t('carHint')}</Body>

      <Label>{t('carModel')}</Label>
      <Field value={model} onChangeText={setModel} placeholder={t('carModelPlaceholder')} maxLength={60} />

      <Label>{t('carColor')}</Label>
      <Field value={color} onChangeText={setColor} placeholder={t('carColorPlaceholder')} maxLength={30} />

      <Label>{t('plate')}</Label>
      <Field
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

      {error ? <Body error>{error}</Body> : null}
    </Screen>
  );
}
