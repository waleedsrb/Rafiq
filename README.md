# Rafiq · رفيق

Book a seat in a verified driver's car between West Bank cities. First route: Ramallah ↔ Nablus.

## Where things are

| Path | What it holds |
|---|---|
| `src/app/` | Screens. Every file is a route (Expo Router). |
| `src/theme/tokens.ts` | Colors, spacing, radii, fonts from the design system |
| `src/i18n/` | All user-facing text in `ar_m` / `ar_f` / `en` |
| `src/lib/supabase.ts` | Database client |
| `supabase/migrations/` | Database schema, rules and permissions (SQL) |
| `supabase/tests/` | SQL checks for the booking rules |
| `bot/` | Python job that reads public Telegram channels into checkpoint reports |
| `docs/decisions/` | Why we chose what we chose (one short file per decision) |

## Run it

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase URL + anon key
npx expo start               # scan the QR code with Expo Go, or press w for web
npm run typecheck
```

## Database

Apply migrations with the Supabase CLI (`supabase db push`) or paste them into the SQL editor in order. To check the booking rules:

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f supabase/tests/booking_rules.sql
```

## Fake SMS during development

Sign up uses Supabase phone sign-in. So we don't send real SMS while building, add **test phone numbers** in the Supabase dashboard (Authentication → Providers → Phone → Test phone numbers and OTPs), for example:

```
970591111111=123456   # a "driver"
970592222222=123456   # a "passenger"
```

Type `0591111111` in the app and use code `123456`. A real SMS provider comes later, behind its own adapter.

## Tests

```bash
npm test   # app logic (node:test)
```

The database checks in `supabase/tests/` run in CI on plain Postgres.

## How we work

- One thin slice at a time. **Slice 1:** sign up → post trip → request seat → driver accepts.
- Small pull requests into `main`, one idea each.
- Write a short decision note in `docs/decisions/` for anything hard to undo.
