// Crash reporting: sends unexpected errors from people's phones to Sentry (project rafiq-app),
// so we hear about a crash before a rider has to tell us.
//
// In Expo Go this catches JavaScript errors. Native crashes (the app vanishing) need the
// development/store build, where the @sentry/react-native native module is included.
import * as Sentry from '@sentry/react-native';
import * as Updates from 'expo-updates';

import { crashOptions, crashUser } from './crash-config';

Sentry.init(
  crashOptions({
    isDev: __DEV__,
    build: process.env.EXPO_PUBLIC_BUILD,
    channel: Updates.channel,
    updateId: Updates.updateId,
  }),
);

export const wrapRoot = Sentry.wrap;

export function setCrashUser(userId: string | null | undefined) {
  Sentry.setUser(crashUser(userId));
}

// Long-press on the build line in Account sends this, to check reports arrive end to end.
export function sendTestCrash() {
  Sentry.captureException(new Error('Rafiq test crash report (sent on purpose from Account)'));
}
