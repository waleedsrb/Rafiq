// The launch gate lives above navigation. This front door only resolves the
// session destination; revisiting it within a process never replays branding.

import { Redirect } from 'expo-router';

import { useSession } from '@/lib/session';
import { launchDestination } from '@/lib/launch-state';

export default function Index() {
  const { session, profile } = useSession();
  return <Redirect href={launchDestination(!!session, !!profile)} />;
}
