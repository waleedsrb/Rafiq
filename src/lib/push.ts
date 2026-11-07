// Push notifications: ask permission at the moment it is useful (after posting
// a trip or requesting a seat), then give the database this phone's token.
// The database sends the notifications itself (see notify_booking_event()).

import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { router } from 'expo-router';
import { useEffect } from 'react';
import { Platform } from 'react-native';

import { supabase } from './supabase';

// Show notifications as a banner even when the app is open.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

let currentToken: string | null = null;

async function getToken(): Promise<string | null> {
  if (Platform.OS === 'web') return null;
  // The Expo project id comes from app.json (written by `npx eas init`).
  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;
  if (!projectId) {
    console.warn('Push: no EAS projectId in app.json yet (run `npx eas init`)');
    return null;
  }
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Rafiq',
      importance: Notifications.AndroidImportance.HIGH,
    });
  }
  try {
    return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  } catch (e) {
    console.warn('Push: could not get a token', e);
    return null;
  }
}

/** Ask for permission if we haven't yet, then register this phone. */
export async function askForPush() {
  try {
    const current = await Notifications.getPermissionsAsync();
    const status = current.granted ? current.status : (await Notifications.requestPermissionsAsync()).status;
    if (status !== 'granted') return;
    await registerToken();
  } catch (e) {
    console.warn('Push: permission request failed', e);
  }
}

async function registerToken() {
  const token = await getToken();
  if (!token) return;
  currentToken = token;
  await supabase.rpc('register_push_token', { p_token: token });
}

/** Call before signing out, so this phone stops getting your notifications. */
export async function forgetPush() {
  if (!currentToken) return;
  await supabase.rpc('unregister_push_token', { p_token: currentToken });
  currentToken = null;
}

/**
 * While signed in: refresh the token if permission was already given (never
 * asks), and open the right screen when a notification is tapped.
 */
export function usePush(signedIn: boolean) {
  useEffect(() => {
    if (!signedIn || Platform.OS === 'web') return;

    Notifications.getPermissionsAsync().then((p) => {
      if (p.granted) registerToken();
    });

    function open(n: Notifications.Notification) {
      const url = n.request.content.data?.url;
      if (typeof url === 'string') {
        router.push(url as never);
        Notifications.clearLastNotificationResponse();
      }
    }
    const last = Notifications.getLastNotificationResponse();
    if (last?.notification) open(last.notification);
    const sub = Notifications.addNotificationResponseReceivedListener((r) => open(r.notification));
    return () => sub.remove();
  }, [signedIn]);
}
