import { router, type Href } from 'expo-router';

import { dialogsClosed } from '@/lib/dialog';

/**
 * Go back if there is a screen to go back to, otherwise go Home.
 * After an app reload, a screen like "Your car" can be the only screen in the
 * stack, and router.back() then silently does nothing.
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/home');
}

/**
 * Open a page right after a pop-up answer. Waits until the pop-up has fully left
 * the screen first: if a page opens while it is still sliding away, and the pop-up
 * sits inside the trip card (its own native window), iOS can leave an invisible
 * window on top that swallows every touch, so the app looks frozen.
 */
export async function pushAfterDialog(href: Href) {
  await dialogsClosed();
  router.push(href);
}
