# Notifications: presentation research and inbox behavior

## Button-origin presentation

The requested effect is a source-linked zoom transition. Liquid Glass is the material;
the transition connects the tapped control to the destination and back. Apple's
WWDC25 UIKit presentation demonstrates glass buttons morphing into presentations:
https://developer.apple.com/videos/play/wwdc2025/284/ (Presentations chapter).

Expo Router exposes native iOS zoom through `Link.AppleZoom` inside `Link asChild`,
with optional `Link.AppleZoomTarget` alignment at the destination:
https://docs.expo.dev/router/advanced/zoom-transition/

Rafiq's installed Expo Router includes these APIs. Zoom is iOS 18+; native Liquid
Glass is iOS 26+. Unsupported platforms need ordinary navigation/frosted controls.
The Expo API is alpha, and its documentation records native-header glitches and
possible rapid open/close latency. Rafiq already hides native stack headers, but
notification-row swipes must still be tested against interactive dismissal.

Recommendation: prototype the Home bell as the zoom source, keeping a readable
porcelain inbox and glass navigation controls. Keep the route/deep-link behavior,
reverse toward the bell on return, and verify Reduced Motion on a phone. Do not
stretch a translucent material over the entire text list merely to get the effect.
Source-linked native zoom is the first candidate; a custom Reanimated layer is
the fallback if native timing or gesture conflicts fail phone acceptance.

Existing search/trip layers provide a different, custom route to spatial continuity:
source measurement, animation on the UI thread, blur during resizing, and native
glass after settling. That provides more control but also adds modal/focus/safe-area
lifecycle work. It should not be copied without a demonstrated need.

Glass SDK reference (v58):
https://docs.expo.dev/versions/v58.0.0/sdk/glass-effect/

This change researches presentation; it does not replace the notification route's
slide animation. The proposed animation still needs a native prototype and phone check.

## Inbox acceptance criteria

- Opening the inbox alone preserves unread rows.
- Opening an individual notification marks that notification read.
- Direction C: in English, swipe right to reveal Mark as read on the left; swipe
  left to reveal Delete on the right. Mirror directions in Arabic. Each side shows
  one action. Read is absent for already-read items.
- A partial swipe settles at the revealed action; tapping performs it. Delete
  reveals in `colors.statusClosedSoft` with red text and becomes
  `colors.statusClosed` with white text while pressed. Read uses the corresponding
  sunken/graphite surfaces. Keep shared typography, spacing, radii and targets.
- A full swipe arms the action at 72% of the measured row width. Its
  surface becomes dark at that threshold; release performs it. Retreating below
  the threshold disarms it. A fast short flick must not execute Delete.
- A successful read removes the unread treatment; a successful delete removes
  the row. Both refresh the Home bell.
- Failures retain the row/state and show a useful retryable error.
- Each mutation is scoped to the signed-in owner; another account cannot mutate it.
- Arabic layout and assistive actions provide the same operations.
- New push payloads should identify their exact inbox row so a push tap can mark
  that row read without guessing from a URL shared by several notifications.

Read notifications remain in history until deleted. Read status and deletion
serve different purposes.

## Validation of two-stage swipes

116 app tests and TypeScript passed. Browser tests with mocked inbox/RPC responses
verified partial reveal without navigation/read, full-distance hold without mutation,
retreat cancellation, full-release deletion, and actual revealed-button deletion.
Screenshots confirmed soft red at partial reveal and solid red with white text when
armed or pressed. Standard read/delete failures, auto-read and revisit checks passed.
Database ownership/persistence was separately checked against the disposable Postgres
CI environment. No hosted migration or native device verification was performed.
