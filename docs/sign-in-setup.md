# Sign-in setup: email, Google, Apple

The app now offers four ways in: phone (SMS code), email (emailed code), Google
and Apple (iPhone only). The code is in `src/lib/social-sign-in.ts`,
`src/app/sign-up/email.tsx` and `src/app/sign-up/code.tsx`. Each provider also
has to be switched on in the Supabase dashboard, with keys from Google and Apple.
Nothing here costs money except the Apple Developer account.

Dashboard: https://supabase.com/dashboard/project/pomyvelsxfzvplkzjlou

## 1. Redirect URLs (needed for Google)

Authentication → URL Configuration → Redirect URLs, add:

- `rafiq://auth-callback` (real builds)
- `exp://**` (Expo Go while testing)

## 2. Email code

1. Authentication → Sign In / Providers → Email: make sure it is **on**.
   "Confirm email" can stay on; the code itself confirms the address.
2. Authentication → Emails → Templates → **Magic Link**: the app types a code,
   so the email must show it. Replace the body with:

   ```html
   <h2>رمز الدخول إلى رفيق · Your Rafiq code</h2>
   <p style="font-size:28px;letter-spacing:6px"><b>{{ .Token }}</b></p>
   <p>صالح لمدة ساعة. · Valid for one hour.</p>
   ```

   Do the same for the **Confirm signup** template (first sign-in of a new address).
3. Limit to know about: Supabase's built-in mailer sends only about 2 emails per
   hour, which is fine for testing. Before the pilot, plug in a real sender under
   Authentication → Emails → SMTP Settings (Resend's free plan is 3,000 emails a
   month, and needs a domain you own).

## 3. Google

1. https://console.cloud.google.com → create a project "Rafiq".
2. APIs & Services → OAuth consent screen: External, app name Rafiq, your email.
3. Credentials → Create credentials → OAuth client ID → **Web application**.
   Authorized redirect URI: `https://pomyvelsxfzvplkzjlou.supabase.co/auth/v1/callback`
4. Copy the Client ID and Client secret into Supabase → Sign In / Providers →
   **Google**, and switch it on.

This works in Expo Go and in real builds, on iPhone and Android, because Google's
page opens in a secure browser sheet. No Android or iOS client IDs are needed.

## 4. Apple (iPhone only)

Needs the Apple Developer Program ($99 a year), which the App Store needs anyway.

1. https://developer.apple.com/account → Identifiers → App ID `app.rafiq` →
   tick **Sign in with Apple**.
2. Supabase → Sign In / Providers → **Apple**, switch it on, and in
   "Client IDs" put: `app.rafiq,host.exp.Exponent`
   (the second one lets it work in Expo Go while testing).
   The secret key fields are only for Apple sign-in on the web; leave them empty.

Apple's rules: an iPhone app that offers Google sign-in must also offer Apple,
which is why both arrive together.

## What changes for people

- Email, Google and Apple accounts have no verified phone, so the profile step
  asks for a mobile number. It is shown to the other side only from an hour
  before an accepted trip, and it is **not** checked by SMS in the pilot.
  The ID check by the admin is what makes an account trustworthy.
- One person, one account: the same person signing in by phone and then by
  Google gets two accounts. Supabase links them automatically only when the
  emails match (Google and email code), not across phone and email.
- The admin site still signs in by phone.
