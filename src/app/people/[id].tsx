// Someone's page, on a screen of its own (opened from a seat request).
// The same block shows inside the trip card when a passenger taps the driver.

import { useLocalSearchParams } from 'expo-router';

import { PersonProfile } from '@/components/person-profile';
import { Screen } from '@/components/ui';

export default function Person() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Screen back scroll>{id ? <PersonProfile id={id} /> : null}</Screen>;
}
