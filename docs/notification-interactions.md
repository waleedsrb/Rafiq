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

## Inbox acceptance criteria (decided with Waleed, 2026-11-09)

- Opening the inbox alone keeps unread messages unread. "Mark all as read" (double
  check, top bar, shown only while something is unread) clears them all.
- Tapping a message opens its page or action straight away. Marking it read happens in
  the background and never blocks the navigation.
- Swipes follow Mail: in English, swipe right for Read and left for Delete; mirrored in
  Arabic. Read is absent for already-read messages.
- Style "B, inset capsule" (switched from C on 2026-11-09): a 16pt-radius capsule
  with icon and word, inset from the row. Soft tint at rest (sunken /
  statusClosedSoft); solid (ink / statusClosed) with white icon and word when armed.
- A partial swipe settles with the button showing; tapping it performs it; tapping the
  row closes it.
- A full swipe arms at 60% of the row width with a haptic tick; letting go performs it.
  Retreating below 60% disarms it.
- Delete slides the row out, the list closes the gap, and "Notification deleted · Undo"
  shows for 4 seconds before the server delete. Leaving the page sends it at once.
- Every change shows at once and is put back with an error if the server refuses.
- Each mutation is scoped to the signed-in owner; another account cannot mutate it.
- Screen readers get Open, Mark as read and Delete as actions on the row.
- Pushes carry their inbox row id, so tapping a push marks exactly that row read.

Read notifications remain in history until deleted.

## Validation of two-stage swipes

116 app tests and TypeScript passed. Browser tests with mocked inbox/RPC responses
verified partial reveal without navigation/read, full-distance hold without mutation,
retreat cancellation, full-release deletion, and actual revealed-button deletion.
Screenshots confirmed soft red at partial reveal and solid red with white text when
armed or pressed. Standard read/delete failures, auto-read and revisit checks passed.
Database ownership/persistence was separately checked against the disposable Postgres
CI environment. No hosted migration or native device verification was performed.
