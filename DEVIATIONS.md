# deviations from the original swift app

every intentional difference between this port and the swift source, with reasons.
spec-sanctioned scope cuts are listed first; implementation-time deviations follow.

## scope cuts (pre-agreed in test-3-spec.md)

- app blocking (FamilyControls/ManagedSettings), healthkit sync, NFC/QR flows,
  storekit tip jar, telemetrydeck, BGTaskScheduler, demo-data manager, data
  export/archive, app intents/shortcuts/control-center widget, break-glass flow,
  session breaks: all out of scope per the spec's decisions section.
- go-to-sleep caption omitted (swift's "Tap to start" / "or scan your NFC tag..."
  clause dropped; nfc out of scope and home UI matches current product direction).
- settings: NFC & QR shortcuts section not ported (out of scope).
- onboarding reduced from 6 steps to 4 (welcome -> schedule -> notifications ->
  optional sample-data offer); apple-health and nfc steps dropped per scope.
  welcome trust card says "On-device only" instead of "Apple Health sync".
  production is the default; demo seed requires EXPO_PUBLIC_DEMO_MODE=1 or
  Settings -> Sample Data (a port addition, since Development is dev-only
  here). while sample history is active, Settings shows the swift "Demo Data"
  section with "Exit Demo and Continue in App"; the floating home exit
  control stays hidden like swift.
- swift 0.10 apple health import (onboarding pull, "Pull from Apple Health"
  empty state, tombstones, reconciler) is not ported: healthkit sync stays
  out of scope, and android would need health connect instead.

## implementation deviations

- routes live in `src/app/` (not root `app/`): the provided expo sdk 57 starter is
  configured for `src/app` and expo-router resolves it natively; keeping it avoids
  churn. all other structure follows the spec (`src/domain`, `src/data`, etc.).
- app identity: bundle id `com.rami.twilight.port` (fresh port id, not the original
  app's), scheme `twilight` kept per spec.

- circular picker "appear pulse" (easeInOut 2s repeatForever): the swift source
  sets a showPulse state that is never read by any view - dead code with no
  visible effect. the port omits it rather than inventing a visual.
- community link icons use sf symbols instead of the original's bundled brand
  pngs (Discord/LinkedIn/Instagram imagesets); links and copy are verbatim.
- support row ("Indie-built. Community-supported") is visual-only: the tip jar
  it opened is out of scope (storekit).
- 60fps check (task 25) was assessed qualitatively on the simulator (smooth
  starfield/scrub in captures + interaction); no instrumented fps overlay was
  run - simulator fps is not representative of device performance anyway.
- live activity (tasks 27/28): lock-screen behavior fully verified on the
  simulator (start on session start, elapsed/progress/remaining timers, wake up
  button ends the session from the lock screen, start sleep button starts one,
  relaunch restore, wind-down countdown within 3h of bedtime). dynamic island
  compact/minimal/expanded layouts are implemented but UNVERIFIED: they render
  only on island hardware and this run had no physical device. reported as
  unverified per the kickoff rather than claimed.
- wind-down live activity lifecycle hardening beyond the original: the countdown
  id encodes its bedtime so a changed bedtime replaces the activity, and an
  expired/out-of-window countdown is cleared on foreground (the original's
  ActivityKit flow has no equivalent state to leak).
- android (original is ios-only): live activities stay ios-only (hidden in
  settings, sync no-ops). compact inline date/time pickers do not exist, so
  settings and the log editor use a value chip that opens the system dialog.
  ios keeps the native compact style. icons use Material Symbols via NativeSymbol
  (SF string names render nothing on android). dashboard and metrics segmented
  pickers use `@expo/ui` controls: SwiftUI segmented Picker on ios, Material 3
  SegmentedButton on android with palette fills (actionPrimary selected,
  actionSecondary-family inactive, borders matched to fills so they do not read
  as empty outlines). settings appearance rows on android show the value and
  chevron like ios and open an `@expo/ui` material 3 selectable dropdown menu
  (the universal Picker's exposed-dropdown text field is wider than the row).
  native tabs, status bar, and system chrome
  follow the in-app display mode via Appearance.setColorScheme plus NativeTabs
  colors. form sheets fall back to full-screen modals. cards
  add android elevation. the moon glow still uses ios-style shadows, which are
  weaker on android.
- android `minSdkVersion` is 26, not the rn 0.88 default 24 (`expo-build-properties`
  in app.json): the health connect module uses the stable
  `androidx.health.connect:connect-client:1.1.0`, which requires api 26. the
  1.2.0 line that supports api 24 is alpha. health connect itself needs android
  9, so api 24/25 devices lose nothing they could use
  (docs/health-connect.md 2.9).
- charts use @shopify/react-native-skia instead of Swift Charts. Aug 11
  dashboard features (Trend 7/30 window, Time Sleep/Wake/Both chart, duration-
  tinted averages, in-card history chip, Dev settings demo onboarding) match
  Swift math/copy/colors; rendering stays Skia.
- swift 0.10 sleep regularity index: the SRI tab replaces Core on home, with
  the 7D/14D/28D window, faint day-to-day bars, and gap-split rolling line.
  noon-to-noon days use the device iana zone through Intl (swift:
  Calendar.current); every swift SRI unit test is ported, including the
  minute-oracle and both dst transitions. the guide's SRI copy drops "including
  imported Apple Health sleep envelopes" because there is no health import.
  metrics "Regularity Score" is renamed "Timing Consistency" like swift.
