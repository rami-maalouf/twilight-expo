# deviations from the original swift app

every intentional difference between this port and the swift source, with reasons.
spec-sanctioned scope cuts are listed first; implementation-time deviations follow.

## scope cuts (pre-agreed in test-3-spec.md)

- app blocking (FamilyControls/ManagedSettings), healthkit sync, NFC/QR flows,
  storekit tip jar, telemetrydeck, BGTaskScheduler, demo-data manager, data
  export/archive, app intents/shortcuts, break-glass flow, session breaks: all
  out of scope per the spec's decisions section. the ios home-screen widget
  and control-center control stay unported (ios keeps only the live
  activity); android gets home-screen widgets instead (see below).
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
- turning the Live Activity toggle off now removes a running activity (and
  turning it on restores it), and a changed goal or bedtime resyncs it; the
  original only reads the toggle when a session starts.
- android (original is ios-only): the live activity becomes an ongoing
  session notification (see below); home-screen widgets are android-only. compact inline date/time pickers do not exist, so
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
- android home-screen widgets (expo-widgets 58 + glance, `widgets/*.android.tsx`,
  `plugins/android-widgets`, `modules/twilight-widget-actions`). ios gets no
  widget target (`ios: null`; the bare `expo-widgets` entry still only builds
  the live activity extension).
  - "Sleep Status" (2x2) ports ProfileControlWidget: "Gn" + moon header, green
    container with white text and a clock + elapsed time while asleep, whole
    widget opens twilight. the blocking-profile rows (blocked count, options,
    break, "Unavailable / Different profile active") are out of scope; in
    their place it shows last night / bedtime / wake rows (awake) or since /
    wake rows (asleep), and a Start Sleep / Wake Up pill replaces "Tap to
    open". swift's `Color.green` container is deepened to a #2fb855 to
    #1c8a3e gradient so the white text stays readable.
  - "Sleep Mode" (2x1) stands in for SleepModeControlWidget (android has no
    control center): "Start Sleep" + moon rgb(0,212,255) / "Wake Up" + sun
    rgb(255,191,0), status "Off" / "On".
  - "Sleep Overview" (4x2) is an android addition: last night's sleep against
    the goal (progress bar), the dashboard's 7-night average, bedtime and wake
    targets.
  - picker copy is sleep-specific instead of swift's profile copy ("Twilight
    Profile" / "Monitor and control your selected focus profile"): "Sleep
    Status", "Sleep Mode" (swift "Twilight Sleep Mode"; the picker already
    groups widgets under Twilight), "Sleep Overview", with matching
    descriptions in app.json.
  - buttons open the app like swift's `openAppWhenRun` intents: the press is
    stored natively as a pending start/stop and the app runs it on launch or
    foreground through the dashboard toggle (including the "Pause..." short
    sleep joke). a press older than 2 minutes is dropped instead of firing by
    surprise later. starting or stopping from a widget never goes through an
    activity url, so android cannot replay it after process death.
  - elapsed time reads "2h 14m" and is computed when the widget renders (glance
    has no ticking timer like swift's `.timer` text, and swift's 60 one-minute
    timeline entries have no expo-widgets equivalent on android). widgets
    re-render on every foreground and about once a minute while asleep: a js
    timer while the app is visible, a non-waking inexact alarm otherwise, so
    the value is current whenever the screen is on and may jump after doze.
  - colors follow the display mode and palette (night sky twilight/amethyst
    gradient with a few stars, sunset in light mode). in "system" mode the
    widget picks light or dark when it renders, so a system theme switch shows
    on the next re-render (app foreground, session change, minute tick).
  - a force-stopped app shows the launcher's placeholder until it is opened
    again (android masks widgets of stopped packages).
- twilight://sleep/start and twilight://sleep/stop (swift handleSleepModeLink)
  run through the dashboard toggle with swift's "Pause..." messages, on both
  platforms. android hardening with no swift equivalent: a restored
  MainActivity drops its launch link so an old link is not replayed after
  process death, and onNewIntent keeps the newest link as the activity intent
  so a link that revives the app after process death is not lost
  (`plugins/android-launch-intent.cjs`).
- android session notification (the live activity's android twin, driven by
  the same `useLiveActivitySync` lifecycle; native side in
  `modules/twilight-widget-actions` `TwilightSessionNotification.kt`).
  - while asleep: "Rejuvenating...", an elapsed chronometer in the header
    (android's `H:MM:SS` stopwatch format instead of swift's "1h 23m"; it
    ticks without the app), a progress bar toward the sleep goal,
    "<Xh Ym> left" / "Goal reached" and a Wake Up action. ongoing, silent,
    public on the lock screen, teal accent. on android 16 it asks to be
    promoted to a live update (status bar chip with the timer, progress
    style bar with a moon tracker); older versions show the classic
    progress bar. promotion itself is unverified: the android 16 (36.0)
    emulator image predates live updates (16 qpr1), so it shows the
    progress style notification without the status bar chip. progress and
    "left" refresh about once a minute through a non-waking inexact alarm,
    like the widgets, so they can lag after doze.
  - within 3 hours of bedtime (no session): "Winding down...", a countdown
    chronometer to bedtime, "Bedtime at <time> - dim the lights" and a Start
    Sleep action; android removes it at bedtime by itself. unlike the
    session it can be swiped away, and a dismissed countdown stays away
    until the bedtime changes.
  - standard notification templates instead of expo-widgets 58
    `createCustomNotification`: custom RemoteViews can never be promoted to
    a live update, have no chronometer (the elapsed time would only move
    when js re-renders it), and their button presses only reach js while
    the app process is alive.
  - Wake Up / Start Sleep work with the app swiped away and the phone
    locked: a native receiver records the press with its time in the
    widgets' pending-action store, updates the notification at once, and
    starts a headless js task (`TwilightSessionAction`, registered in
    `index.ts`, the app's entry, before expo-router) that ends or starts
    the session at the press time through the app's store and refreshes the
    widgets. if js cannot start, the app applies the press when it next
    opens, still at the press time (presses older than 12 hours are
    dropped). no "Pause..." joke unless the app is on screen, like the ios
    button.
  - the settings row reads "Sleep Notification" with android copy instead
    of "Live Activity" / "...with some inspirational quote" (the original
    never shows a quote). turning it on asks for POST_NOTIFICATIONS (android
    13+) and points to system settings when notifications are off; starting
    a session asks too, only while android still allows a prompt.
  - channels: "Sleep session" and "Bedtime countdown" (default importance
    with no sound or vibration: low importance files them under "Silent",
    which pixel hides from the lock screen and the status bar) next to
    "Wind-down reminders" (default importance) for the daily reminder,
    which previously used expo's fallback channel. all use the monochrome
    moon small icon (for the reminder through the expo-notifications plugin
    entry in app.json, with the teal accent; the countdown uses gold).
  - the notification is reposted after a reboot or an app update (alarms
    and possibly the notification are gone); a relaunch reconciles it with
    the stored session.
- settings "Go to settings to disable globally" (swift link at the end of
  Notifications, hidden while sleeping) opens the app's notification
  settings on android and the app's settings page on ios.
