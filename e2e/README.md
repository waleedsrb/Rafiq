# End-to-end tests

The unit tests (`npm test`) check small pieces of logic, and the database tests
(`supabase/tests/`) check the rules in SQL. Neither one opens the app. These tests do:
they install the real Android app on an emulator and tap through a whole ride the way
two people would, against a real (local, throwaway) Supabase.

## What runs

| Flow | Who | What it proves |
| --- | --- | --- |
| `00-new-rider-signs-up` | Lina (new) | Sign-up from scratch: email code, name, gender, phone, lands on Home; the name and phone are saved |
| `01-driver-posts-trip` | Dana (driver) | Email sign-in with a code, then Post a trip: Next, Next, Next, Publish |
| `02-rider-requests-seat` | Amir (passenger) | Finds Dana's trip from Home and requests a seat, paying cash; no plate yet |
| `03-driver-accepts` | Dana | Sara asks while Dana watches and Home updates live; Dana accepts Amir and declines Sara |
| `04-rider-did-you-ride` | Amir | 50 min after departure, unstarted: an inbox notice opens the trip, the plate shows, he shares the trip, and answers "Did you ride?" on Home |
| `05-driver-overdue-start` | Dana | The overdue nudge is in her inbox; "All in · Start" starts the trip |
| `06-driver-reports-checkpoint` | Dana | On the road, holds "Closed" on Zaatara; it counts as a driver's report |

After each flow, a SQL check in `sql/` looks in the database to confirm the tap really
landed (a screen can say "Saved" while the request failed). Between flows 03 and 04,
`sql/trip-day.sql` moves the trip 50 minutes into the past and runs the nudge job, which is
how we test something that normally takes an hour of waiting.

## How it fits together

- **Someone else, mid-flow**: one emulator is one person at a time. When a flow needs
  another person to act while it watches (Sara asking for a seat in flow 03), it calls
  `scripts/hook.js`, which asks `scripts/hooks.py` (a small local server run.sh starts) to
  run a file from `sql/hooks/` as that person.

- **Supabase**: `supabase start` (config in `supabase/config.toml`) builds a database from
  every file in `supabase/migrations`, so the tests also prove the migrations apply on a
  real Supabase. `seed.sql` adds the test people, verified the same way the admin site does.
- **Sign-in codes**: the local Supabase "sends" emails into Mailpit, a pretend inbox at
  http://localhost:54324. `scripts/email-code.js` reads the code from it.
- **The app**: built with Gradle on the CI machine (no EAS minutes). `scripts/` switches
  off over-the-air updates, adds a placeholder Maps key and allows plain `http` to the
  local Supabase, only for this build.
- **Maestro** reads the YAML flows and drives the emulator. It finds buttons by their
  words, or by a `testID` where words repeat or change (search the code for `testID=`).

## Running it

On GitHub: the "End-to-end" workflow runs on pull requests that change the app or the
database, after every merge to main, every night, and from the Actions tab (Run workflow).

A design-only pull request (colours, spacing, fonts, icons, copy, animation) can skip it
with the label **design**. The full run still follows on main and that night. Don't use it
when the change touches what a screen does: buttons, navigation, forms, data, or anything
a flow taps or reads (search the code for `testID=`). If it fails, open the run and download
the `e2e-output` artifact: it has screenshots and Maestro's logs for each flow.

On a computer with Docker, Android Studio's emulator and Maestro installed:

```sh
supabase start
# build and install the app with EXPO_PUBLIC_SUPABASE_URL=http://10.0.2.2:54321, then:
bash e2e/run.sh
supabase db reset   # back to an empty database for the next run
```

## Adding a flow

Write it the way a person would describe the task ("Amir cancels his seat"), one flow per
person and goal. Start it with `runFlow: common/sign-in.yaml`, prefer visible words over
`testID`, and add a SQL check that looks for the result in the database.
