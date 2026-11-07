// Small taps you feel, used sparingly (Apple HIG): a light tap for the main button
// on a screen, a selection tick when you pick a chip, a tab or a number.
import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

const on = Platform.OS === 'ios' || Platform.OS === 'android';

export function tapFeel() {
  if (on) Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

export function selectFeel() {
  if (on) Haptics.selectionAsync().catch(() => {});
}

export function successFeel() {
  if (on) Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}
