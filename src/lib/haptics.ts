// Small taps you feel, used sparingly (Apple HIG): a light tap for the main button
// on a screen, a selection tick when you pick a chip, a tab or a number.
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

const on = Platform.OS === 'ios' || Platform.OS === 'android';

export function tapFeel() {
  if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function selectFeel() {
  if (on) Haptics.selectionAsync().catch(() => {});
}

let lastTick = 0;
/** One crisp tick as a number passes the middle of a time wheel, like the iPhone's own
 *  picker. A fast spin passes many rows per frame: ticks closer than 30 ms together are
 *  dropped so they never blur into a buzz or arrive late in a pile. */
export function wheelTick() {
  const now = Date.now();
  if (now - lastTick < 30) return;
  lastTick = now;
  if (on) Haptics.selectionAsync().catch(() => {});
}

export function successFeel() {
  if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

export function warnFeel() {
  if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}

/** One pulse of the hold-to-report hum (iPhone): the same light tap every time, so the
 *  pulses blend into one hum as they speed up. */
export function humPulse() {
  if (Platform.OS === 'ios') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Android: play the whole speeding-up hum as one vibration pattern; stopHum() ends it. */
export function startHumAndroid(pattern: number[]) {
  if (Platform.OS === 'android') Vibration.vibrate(pattern);
}

export function stopHum() {
  if (Platform.OS === 'android') Vibration.cancel();
}

/** The report went through: a firm knock, then the success pattern (hold to report). */
export function confirmFeel() {
  if (!on) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Rigid).catch(() => {});
  setTimeout(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}), 90);
}
