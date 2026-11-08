// Sign in with Apple and Google, both through Supabase Auth.
//
// Apple (iPhone only): the system sheet gives us an identity token signed by
// Apple, and Supabase checks it. A nonce ties the token to this one attempt, so
// a stolen token cannot be replayed: Apple gets the hashed nonce, Supabase the
// raw one, and Supabase checks that they match.
//
// Google (iPhone and Android): Supabase's Google page opens in a secure browser
// sheet, then sends the person back to rafiq://auth-callback with a one-time
// code. With PKCE (see supabase.ts) only this device can swap that code for a
// session, because it holds the secret that started the attempt.
//
// Either way, signing in flips the guards in _layout.tsx, which moves the person
// to the profile step (or home, if they already have a profile).

import * as AppleAuthentication from 'expo-apple-authentication';
import { CryptoDigestAlgorithm, digestStringAsync, randomUUID } from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { oauthCode } from '@/lib/sign-in';
import { supabase } from '@/lib/supabase';

/** What happened: signed in, the person closed the sheet, or something failed. */
export type SignInResult = 'ok' | 'cancelled' | 'failed';

export async function signInWithApple(): Promise<SignInResult> {
  try {
    const rawNonce = randomUUID();
    const hashedNonce = await digestStringAsync(CryptoDigestAlgorithm.SHA256, rawNonce);
    const credential = await AppleAuthentication.signInAsync({
      requestedScopes: [
        AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
        AppleAuthentication.AppleAuthenticationScope.EMAIL,
      ],
      nonce: hashedNonce,
    });
    if (!credential.identityToken) return 'failed';

    const { error } = await supabase.auth.signInWithIdToken({
      provider: 'apple',
      token: credential.identityToken,
      nonce: rawNonce,
    });
    if (error) return 'failed';

    // Apple shares the name only the very first time, and it is not in the token.
    // Keep it on the account so the profile step can fill it in.
    const given = credential.fullName?.givenName;
    const family = credential.fullName?.familyName;
    if (given || family) {
      await supabase.auth.updateUser({ data: { given_name: given ?? '', family_name: family ?? '' } });
    }
    return 'ok';
  } catch (e) {
    // ERR_REQUEST_CANCELED: the person closed the Apple sheet.
    if ((e as { code?: string }).code === 'ERR_REQUEST_CANCELED') return 'cancelled';
    return 'failed';
  }
}

/** Only iPhones (iOS 13+) offer Sign in with Apple, so the button hides elsewhere. */
export function appleSignInAvailable(): Promise<boolean> {
  return AppleAuthentication.isAvailableAsync().catch(() => false);
}

export async function signInWithGoogle(): Promise<SignInResult> {
  // rafiq://auth-callback in a real build, exp://…/--/auth-callback in Expo Go.
  // Both must be in Supabase's list of allowed redirect URLs (see docs/sign-in-setup.md).
  const redirectTo = Linking.createURL('auth-callback');
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo, skipBrowserRedirect: true, queryParams: { prompt: 'select_account' } },
  });
  if (error || !data.url) return 'failed';

  const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (result.type !== 'success') return 'cancelled';

  const code = oauthCode(result.url);
  if (!code) return 'failed';
  const { error: swapError } = await supabase.auth.exchangeCodeForSession(code);
  return swapError ? 'failed' : 'ok';
}
