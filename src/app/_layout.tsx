import {
  IBMPlexSans_400Regular,
  IBMPlexSans_500Medium,
  IBMPlexSans_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans';
import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { usePush } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { colors } from '@/theme/tokens';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
  });

  return (
    <SessionProvider>
      <StatusBar style="dark" />
      {fontsLoaded ? <Routes /> : null}
    </SessionProvider>
  );
}

// Which screens exist depends on where the person is in sign up.
// Stack.Protected hides a group of screens unless its guard is true, so a
// signed-out person can never land on "home", and a signed-in one never sees "phone".
function Routes() {
  const { loading, session, profile } = useSession();

  useEffect(() => {
    if (!loading) SplashScreen.hideAsync();
  }, [loading]);

  const ready = !loading && !!session && !!profile;
  usePush(ready);

  if (loading) return null;

  const signedOut = !session;
  const needsProfile = !!session && !profile;

  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.surface } }}>
      <Stack.Protected guard={signedOut}>
        <Stack.Screen name="index" />
        <Stack.Screen name="sign-up/phone" />
        <Stack.Screen name="sign-up/code" />
      </Stack.Protected>
      <Stack.Protected guard={needsProfile}>
        <Stack.Screen name="sign-up/profile" />
      </Stack.Protected>
      <Stack.Protected guard={ready}>
        {/* The tab screens swap in place (the dock uses replace), without a slide. */}
        <Stack.Screen name="home" options={{ animation: 'none' }} />
        <Stack.Screen name="trips/mine" options={{ animation: 'none' }} />
        <Stack.Screen name="account" options={{ animation: 'none' }} />
        <Stack.Screen name="checkpoints/index" options={{ animation: "none" }} />
        <Stack.Screen name="checkpoints/[id]" />
        <Stack.Screen name="car" />
        <Stack.Screen name="verify" />
        <Stack.Screen name="trips/new" />
        <Stack.Screen name="trips/search" />
        <Stack.Screen name="trips/results" />
        <Stack.Screen name="trips/[id]" />
        <Stack.Screen name="trips/checkout/[id]" />
        <Stack.Screen name="trips/requests/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
