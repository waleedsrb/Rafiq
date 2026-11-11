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
import { useEffect } from 'react';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';

import { DialogHost } from '@/components/dialog-host';
import { LaunchGate } from '@/components/launch-gate';
import { TripLayerHost } from '@/components/trip-layer-host';
import { setCrashUser, wrapRoot } from '@/lib/crash';
import { usePush } from '@/lib/push';
import { SessionProvider, useSession } from '@/lib/session';
import { ThemeProvider, useTheme } from '@/theme/theme';

SplashScreen.preventAutoHideAsync();
// The plain graphite native splash hands off to the shared launch reveal once
// fonts and the device-local launch preference are ready to paint.
SplashScreen.setOptions({ fade: true, duration: 400 });

// wrapRoot reports any crash below it to Sentry (src/lib/crash.ts).
export default wrapRoot(RootLayout);

function RootLayout() {
  const [fontsLoaded] = useFonts({
    IBMPlexSans_400Regular,
    IBMPlexSans_500Medium,
    IBMPlexSans_600SemiBold,
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
  });

  return (
    // Light, dark or follow the phone (Settings > Appearance, src/theme/theme.tsx).
    <ThemeProvider>
      <SessionProvider>
        <ThemedStatusBar />
        {fontsLoaded ? <Routes /> : null}
        {/* Rafiq's own pop-ups (src/lib/dialog.ts), drawn above every screen. */}
        {fontsLoaded ? <DialogHost /> : null}
      </SessionProvider>
    </ThemeProvider>
  );
}

// Dark clock and battery on a light screen, light ones on a dark screen.
function ThemedStatusBar() {
  const { dark } = useTheme();
  return <StatusBar style={dark ? 'light' : 'dark'} />;
}

// Which screens exist depends on where the person is in sign up.
// Stack.Protected hides a group of screens unless its guard is true, so a
// signed-out person can never land on "home", and a signed-in one never sees "phone".
function Routes() {
  const { loading, session, profile } = useSession();
  const { c } = useTheme();

  const ready = !loading && !!session && !!profile;
  usePush(ready);
  const userId = session?.user.id;
  useEffect(() => setCrashUser(userId), [userId]);

  const signedOut = !session;
  const needsProfile = !!session && !profile;

  return (
    <LaunchGate loading={loading}>
      {loading ? null : (
        <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.surface } }}>
          {/* The launch gate preserves the initial route, including deep links. */}
          <Stack.Screen name="index" />
          <Stack.Screen name="auth-callback" />
          <Stack.Protected guard={signedOut}>
            <Stack.Screen name="intro" options={{ animation: 'fade' }} />
            <Stack.Screen name="welcome" />
            <Stack.Screen name="sign-up/phone" />
            <Stack.Screen name="sign-up/email" />
            <Stack.Screen name="sign-up/code" />
          </Stack.Protected>
          <Stack.Protected guard={needsProfile}>
            <Stack.Screen name="sign-up/profile" />
          </Stack.Protected>
          <Stack.Protected guard={ready}>
            {/* Home, My trips, Checkpoints and Account: the system tab bar. */}
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="checkpoints/map" />
            <Stack.Screen name="checkpoints/[id]" />
            <Stack.Screen name="car" />
            <Stack.Screen name="verify" />
            <Stack.Screen name="notifications" />
            <Stack.Screen name="settings" />
            <Stack.Screen name="emergency" />
            <Stack.Screen name="earnings" />
            <Stack.Screen name="people/[id]" />
            <Stack.Screen name="trips/new" options={{ animation: 'fade' }} />
            <Stack.Screen name="trips/search" />
            <Stack.Screen name="trips/results" />
            <Stack.Screen name="trips/[id]" />
            <Stack.Screen name="trips/checkout/[id]" />
            <Stack.Screen name="trips/requests/[id]" options={{ animation: 'fade' }} />
            <Stack.Screen name="trips/rate/[bookingId]" />
          </Stack.Protected>
        </Stack>
      )}
      {/* Trips open as a card over the page you're on (src/lib/trip-layer.ts). */}
      {ready ? <TripLayerHost /> : null}
    </LaunchGate>
  );
}
