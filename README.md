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

## How we work

- One thin slice at a time. **Slice 1:** sign up → post trip → request seat → driver accepts.
- Small pull requests into `main`, one idea each.
- Write a short decision note in `docs/decisions/` for anything hard to undo.
