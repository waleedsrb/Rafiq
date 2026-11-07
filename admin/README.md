# Rafiq Admin (website)

A small website where admins review ID checks: see each person's photos, then approve,
or reject with a reason the person sees in the app.

It is a separate site, not part of the app, so the app stays small and an admin can work
from a laptop with big photos.

## Run it

```bash
cd admin
cp .env.example .env.local   # same Supabase URL + anon key as the app
npm install
npm run dev                  # opens on http://localhost:5173
```

Sign in with the phone number of your Rafiq account (same SMS code as the app).

## Who is an admin

Admins are rows in `public.admins`. Add one in the Supabase SQL editor:

```sql
insert into public.admins (user_id)
select id from auth.users where phone = '970591234567';
```

## Why the anon key is fine here

Everything is checked by the database, not by this page: only admins can read other
people's requests (RLS), see the photos (private bucket, 10-minute signed links), or
call `review_verification()`. Someone who copies this site gets an empty screen.

## Deploy

`npm run build` writes a static site to `admin/dist/`. Any static host works (Vercel,
Netlify, Cloudflare Pages). Set the two `VITE_` variables in the host's settings.
