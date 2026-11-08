# Launch animation: behavior, implementation, and checks

## What people see

| Situation | Reveal | Destination |
| --- | --- | --- |
| First launch, no saved completion flag | Full road drawing, pause, camera pullback, exact R | Normal session/deep-link destination |
| Later cold launch | Short road/reveal sequence | Normal session/deep-link destination |
| Returning from background | None | Current screen and navigation state |
| Back navigation, sign-out, session refresh | None | Normal navigation/guards |
| Reduced motion enabled at startup | No animation delay or animated handoff | Wait only for actual session readiness |
| Storage read fails | Short reveal | Normal destination; no storage error dialog |
| Storage write fails | Finish normally | Normal destination; next launch may lack history |
| Session restoration takes longer than animation | Hold final logo | Continue only when session loading finishes |

For `/`, a signed-out person goes to `/intro`, a signed-in person without a profile goes to `/sign-up/profile`, and a signed-in person with a profile goes to `/home`. An allowed direct link keeps its requested route; existing Expo Router authentication guards still apply. The gate does not override OAuth callback URLs or notification destinations.

“Cold launch” means a fresh root/JavaScript runtime, such as reopening after the OS terminates it. Merely switching apps, locking/unlocking the phone, or returning through the app switcher usually resumes the existing runtime. The implementation does not attempt to infer whether someone swiped away the app. Browser reloads and new browser documents create fresh roots and therefore show branding.

If the app backgrounds during an unfinished reveal, it keeps the same launch instance. The persistent frame epoch catches up to elapsed time when frames resume; it does not start the drawing again. The OS can suspend timers while backgrounded, so completion/persistence may happen on resume. An OS termination before completion leaves the first-use marker unset.

## Choreography

Full reveal, in milliseconds from the first animation frame:

| Time | Action |
| --- | --- |
| 0–350 | Hold on graphite |
| 350–3950 | Draw between the road's paired contours; spend more time in the tight turn |
| 3950–4200 | Hold the completed curve |
| 4200–6420 | Pull back into the mark without bounce or overshoot |
| 5100–6000 | Reveal the circular head while the camera pulls back |
| 6450 | Switch to the exact shared logo paths |
| 6700 | Signal animation completion and persist the completion flag |
| After completion and session readiness | Fade the cover out over 200 ms |

Returning launches map the same artwork onto 1.8 seconds: 400 ms to draw the road, 1250 ms through the pullback, then 150 ms of rest. These are branding durations, not a promise about total startup time: fonts, local storage, and session readiness can add time. The native graphite splash remains until the first launch scene has laid out.

Reduced motion initializes the exact final mark, signals completion without an animation delay, disables the native splash fade, and removes the cover as soon as session loading is ready. There is no artificial 1.8/6.7-second wait or opacity animation. Without reduced motion, the existing native splash uses a 400 ms fade into the graphite start of the reveal.

## Components and ownership

- `src/app/_layout.tsx`: mounts `LaunchGate` above the stack after fonts load; mounts session initialization independently; retains existing guards and push handling.
- `src/components/launch-gate.tsx`: reads history once, blocks the underlying layout/focus targets while covered, waits for animation plus session readiness, and permanently dismisses its cover for that root mount. Navigation stays mounted; page effects can run while covered. The native splash is hidden when the launch scene lays out, not after the animation.
- `src/components/road-reveal.tsx`: shared SVG/Reanimated rendering. A persistent frame-clock epoch prevents React rerenders from restarting motion. Frame callbacks stop when the reveal settles. No canvas, WebView, network artwork, or new package is required.
- `src/components/launch-timing.ts`: full/short timeline mapping and handoff duration.
- `src/components/intro-motion.ts` and `intro-contours.ts`: exact road/mark geometry, paired contour traversal, curvature-weighted distance, and monotonic camera motion from the approved study.
- `src/components/rafiq-mark.tsx`: shared final mark geometry; decorative SVGs use `aria-hidden` on web and `accessible: false` on native, avoiding an invalid boolean DOM attribute.
- `src/app/intro.tsx`: static landing mark and existing localized entry controls. It does not own a cold-launch timer.
- `src/lib/launch-state.ts`: device-local history and the default landing destination policy.

Session restoration and profile lookup start in `SessionProvider` while fonts/history/branding load. The gate does not add a second Supabase session request or prefetch every trip. Ordinary route data effects may run when navigation mounts; loading beyond that still belongs to the relevant screen.

## Persistence and reset

AsyncStorage key: `rafiq.launch.seen.v1`; completed value: `1`.

Reading a missing or unrecognized value selects full motion. Write `1` only after the selected reveal completes, including the immediate reduced-motion path. An interrupted full reveal does not mark completion. The marker persists across account changes and app updates that preserve application storage. Clearing app data or browser storage removes it; OS backup/restore can preserve it across reinstalls.

For development, remove only this key, then start a fresh runtime. On web, use browser developer tools:

```js
localStorage.removeItem('rafiq.launch.seen.v1');
location.reload();
```

On native, use a temporary developer-console call to `AsyncStorage.removeItem('rafiq.launch.seen.v1')`, then force-quit and reopen. Do not clear the Supabase session merely to replay the animation. There is intentionally no user-facing reset control.

## Automated validation

```sh
npm run typecheck
npm test
npm run lint
```

The repository's lint command currently tries to install/configure missing ESLint dependencies and is blocked in this environment. Changed TypeScript files can be checked with the isolated Expo SDK 58 ESLint configuration used during development; no dependency manifests or lockfiles were changed to add lint tooling.

Unit coverage checks first-use persistence, repeated completion, storage failures, signed-out/profile/Home destination selection, short/full/reduced durations, and continuous non-reversing short timing. The earlier motion tests check finite/ordered contours, road completion before pullback, exact camera alignment, and no overshoot.

Browser validation at 390 × 844 checks a fresh full reveal and saved completion, a short reveal on reload, no replay after back navigation or background/resume simulation, retention of a direct `/sign-up/email` URL, reduced-motion completion, and nonblocking storage failures. Browser checks simulate runtime restarts; they do not establish native OS lifecycle behavior or authenticated backend access.

Recorded for this change (2026-11-08): TypeScript passed; all 74 Node tests passed; changed files passed the isolated Expo ESLint rules; the browser scenarios above passed with no uncaught runtime exceptions. First-use history was cleared for the full test, retained for the cold-reload test, and storage reads/writes were deliberately made to throw for the failure test. Signed-in/profile destination selection was unit-tested; real authenticated native launches were not exercised.

## Native release checklist

1. On iOS and Android, clear only the marker and cold-launch: graphite handoff, full drawing, final mark, then the expected session destination.
2. Force-quit and reopen with the marker saved: short reveal, then Home for a real signed-in account, profile completion for an incomplete account, or the static landing when signed out.
3. Open a trip, background and resume, lock/unlock, and switch apps: no replay or navigation reset.
4. Cold-open a trip notification, shared trip URL, and OAuth callback: preserve their destination and existing authentication guards.
5. Enable Reduce Motion before launch: no timed reveal; verify VoiceOver/TalkBack cannot focus covered controls.
6. Exercise slow/offline session restoration: final mark may hold, but no incorrect signed-out redirect before session loading completes. Existing session/network error handling remains unchanged.
7. Test a small screen, large text, Arabic/RTL, rotation, and interruption during the first full drawing. Verify no trapped cover, inaccessible button, or clipped final layout.

Physical-device startup, native performance, VoiceOver/TalkBack, real signed-in launches, and external deep links still require device validation. Existing unrelated web `direction` style warnings are outside this change.
