# 0004. Shared cold-launch branding

- **Date:** 2026-11-08
- **Status:** Accepted
- **Door:** two-way; timing and visual treatment can change independently of authentication.

## Context

The road reveal originally belonged to `/intro`, which is available only when signed out. Signed-in users bypassed it, and revisiting that route replayed the long animation. We want branding on a new app runtime without delaying every foreground resume or redirecting away from a deep link.

## Decision

Put one launch gate above the navigator. On first use of the current local storage installation, play the full approved contour-following road reveal. After it completes, save a device-local flag. Later cold launches use a 1.8-second version. Reduced motion skips the animation and fade entirely.

The gate is independent of sign-in, account changes, and route changes. It never subscribes to AppState. Navigation and session work can proceed underneath it; the gate does not push or replace routes. Once dismissed it stays dismissed for the lifetime of this root mount.

`/intro` becomes a static, localized signed-out landing page. `/` continues choosing Home, profile completion, or that landing page according to the session. The four-slide `/welcome` flow and sign-in routes keep their existing behavior.

## Consequences

- Signed-in users see the brand on cold launch and then continue to Home, or their requested deep-link destination.
- Foreground resumes, back navigation, sign-out, and token refresh do not replay the reveal.
- Session restoration and initial profile loading overlap the animation. A slow session holds the final mark; animation completion never pretends authentication is ready.
- A failed storage read selects the short version. A failed write never blocks navigation, though a later successful read may still select the full version if nothing was saved.
- Full motion is about 6.7 seconds plus a 200 ms handoff. Returning motion is 1.8 seconds plus that handoff. This intentionally favors a slower first impression and faster repeated access.
- A web reload counts as a cold launch. Development reloads/remounts can replay it; returning a mobile app from the background does not create a new runtime by itself.
- The flag is not an account preference, analytics event, or onboarding-completion record. It must not be deleted on sign-out or incremented merely because the artwork changes.

See [Launch behavior and validation](../launch-animation.md) for timings, implementation boundaries, reset instructions, and platform checks.
