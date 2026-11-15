# Staging database

Rafiq has two Supabase projects:

| | Live | Staging |
|---|---|---|
| Who uses it | Real riders and drivers (store build) | You, testing (Expo Go preview) |
| Project | `pomyvelsxfzvplkzjlou`, Mumbai | `uaxtjusnbstlbcpcmcxq` ("Rafiq Staging"), Frankfurt |
| How changes arrive | Pasted by hand in the SQL Editor, after staging | Automatically, on every merge to main |
| Data | Real | Test people, trips and checkpoint statuses |

## Why

A database change that goes wrong on live breaks the app for everyone, and some changes can't
be undone (a dropped column takes its data with it). Staging is a full copy of the schema with
no real people in it. Every change lands there first, you try it on your phone, and only then
does it go to live. CI already runs the migrations on plain Postgres. Staging adds the real
Supabase pieces CI can't fake: Auth, Storage, cron jobs, pg_net push calls, the API.

## How a change travels

1. A PR adds a file to `supabase/migrations/`. CI checks it on plain Postgres ("Database rules").
2. Merge. Two workflows start:
   - **Staging database** applies the new migration to staging (the Supabase CLI remembers
     which ones are already there, so each runs once), then checks staging matches the repo.
   - **Publish preview** puts the new app on the `preview` branch in Expo Go, talking to staging.
3. Test on your phone. The Account page's build line ends in "staging" so you know where you are.
4. Happy? Paste the same migration into the **live** SQL Editor, as today.
5. Every night the **Drift check** compares both projects with the repo and opens an issue
   ("Live database drift" or "Staging database drift") if either has fallen out of step.

The app and the migration publish at the same time, so for a minute or two after a merge the
new app may reach staging before its migration does. If something looks broken right after a
merge, check that the Staging database run is green, then reopen the app.

## Everyday use

- **Sign in**: phone test numbers with code `123456`:
  Waleed `+970591111111` (admin), Ahmad `+970592222222`, Manar `+970593333333`, Sara `+970594444444`.
  All four are verified drivers with cars.
- **Fresh test data**: Actions -> Staging database -> Run workflow -> tick "reset test data".
  This reloads the 24 test trips and the checkpoint statuses (they fade after 2 hours).
  The scripts are in `supabase/staging/`.
- **Break things freely.** Staging is for that. You can run any SQL there, destructive too.
- **Test the live database on your phone**: Actions -> Publish preview -> Run workflow ->
  pick "live". It publishes a `preview-live` branch in Expo Go.

## One-time setup

1. Create the project in Supabase: name "Rafiq Staging", region Frankfurt (eu-central-1).
   Done Nov 15 2026: ref `uaxtjusnbstlbcpcmcxq`.
2. Staging -> Project settings -> Database -> Reset database password. Keep it somewhere safe.
3. Staging -> Connect -> **Session pooler** -> copy the connection string and put the password in it.
4. GitHub repo -> Settings -> Secrets and variables -> Actions:
   - Secret `STAGING_DB_URL` = that connection string.
   - Variable `STAGING_SUPABASE_URL` = `https://uaxtjusnbstlbcpcmcxq.supabase.co`
   - Variable `STAGING_SUPABASE_ANON_KEY` = staging's legacy anon key (Project settings -> API keys ->
     Legacy; it's public, like live's, and ships inside the app).
5. Staging -> Authentication -> Sign In / Providers -> Phone: turn it on, fill the SMS provider
   with placeholders (as on live), add the four test numbers above with `123456`, and set
   "Test OTPs valid until" far ahead.
6. Actions -> Staging database -> Run workflow. The first run applies every migration and loads
   the test data (about 5 minutes).

Until step 4 is done, the staging workflows skip themselves and preview keeps talking to live.

## Never

- Never put the `STAGING_DB_URL` (it contains the password) or any `service_role` / secret key
  in a file, a chat or the app. Only in GitHub secrets.
- Never run `supabase/staging/*.sql` on live. They create test people and delete test trips.
