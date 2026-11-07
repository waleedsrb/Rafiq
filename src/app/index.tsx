// The app's front door ("/"). It only decides where you belong and sends you there:
// the intro when signed out, the last sign-up step if your profile is missing, Home otherwise.
// It sits outside the guarded groups so "/" always matches something.

import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';

export default function Index() {
  const { session, profile } = useSession();
  if (!session) return <Redirect href="/intro" />;
  if (!profile) return <Redirect href="/sign-up/profile" />;
  return <Redirect href="/home" />;
}
