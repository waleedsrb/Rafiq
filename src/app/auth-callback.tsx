// Where Google sign in sends the person back (rafiq://auth-callback?code=…).
// The browser sheet hands that URL to src/lib/social-sign-in.ts, which finishes
// signing in. Android can also open it as a normal app link, so this route just
// passes on to the front door, which sends the person where they belong.

import { Redirect } from 'expo-router';

export default function AuthCallback() {
  return <Redirect href="/" />;
}
