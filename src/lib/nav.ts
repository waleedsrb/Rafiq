import { router } from 'expo-router';

/**
 * Go back if there is a screen to go back to, otherwise go Home.
 * After an app reload, a screen like "Your car" can be the only screen in the
 * stack, and router.back() then silently does nothing.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}
