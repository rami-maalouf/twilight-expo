# deviations from the original swift app

every intentional difference between this port and the swift source, with reasons.
spec-sanctioned scope cuts are listed first; implementation-time deviations follow.

## scope cuts (pre-agreed in test-3-spec.md)

- app blocking (FamilyControls/ManagedSettings), NFC/QR flows, storekit tip
  jar, telemetrydeck, BGTaskScheduler, demo-data manager, break-glass flow,
  session breaks: all out of scope per the spec's decisions section.
  healthkit sync is not ported to ios; android gets the health connect
  equivalent (below). the spec also cut data export/archive; it is now
  ported on both platforms (see "data archive" below). the ios home-screen
  widget, control-center control and app intents / siri app shortcuts stay
  unported (ios keeps only the live activity and the twilight://sleep
  links); android gets home-screen widgets, a quick settings tile and
  launcher shortcuts instead (see below). the profile intents (start/stop/
  check profile, check session active) are blocking-profile features and
  out of scope on both platforms.
- go-to-sleep caption omitted (swift's "Tap to start" / "or scan your NFC tag..."
  clause dropped; nfc out of scope and home UI matches current product direction).
- settings: NFC & QR shortcuts section not ported (out of scope).
- onboarding reduced from 6 steps to 4 (welcome -> schedule -> notifications ->
  optional sample-data offer); the nfc step is dropped per scope. on android
  with health connect available, a health connect step follows welcome (5
  steps, swift order); ios and android devices without health connect keep 4.
  welcome trust card says "On-device only" instead of "Apple Health sync".
  production is the default; demo seed requires EXPO_PUBLIC_DEMO_MODE=1 or
  Settings -> Sample Data (a port addition, since Development is dev-only
  here). while sample history is active, Settings shows the swift "Demo Data"
  section with "Exit Demo and Continue in App"; the floating home exit
  control stays hidden like swift.
- swift 0.10 apple health import: ported to health connect on android with
  its ui (onboarding step, settings section and screen, "Pull from Health
  Connect" empty state, sync on foreground); see the health connect section
  below. ios has no health sync and shows none of these surfaces.

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
  turning it on restores it), and a changed goal or bedtime updates the
  running activity in place (goal, progress, time left); the original only
  reads the toggle when a session starts.
- android (original is ios-only): the live activity becomes an ongoing
  session notification (see below); home-screen widgets are android-only.
  native tabs, status bar, and system chrome follow the in-app display mode
  via Appearance.setColorScheme plus NativeTabs colors. the android ui uses
  material 3 equivalents of the swift controls (details in the next bullet).
- android material 3 ui (ios keeps the swiftui-style port unless noted):
  - icons are Material Symbols through `NativeSymbol`. expo-symbols only ships
    the outlined (FILL 0) font, so sf `.fill` names render from a FILL 1
    subset generated from google's variable font
    (`scripts/generate-filled-symbols.py` -> `assets/fonts/MaterialSymbolsFilled.ttf`,
    apache 2.0); the outlined glyph shows until that font has loaded. filled
    glyphs come in one weight (400).
  - date and time: no compact inline pickers exist, so settings and the log
    editor show a value chip that opens jetpack compose material 3 dialogs:
    a time dialog titled "Bedtime" / "Wake Up" in the device's 12/24-hour
    format, and the m3 date picker for "Wake day" (it keeps material's own
    "Select date" title; expo-ui exposes no custom title). times follow the
    android "use 24-hour format" switch through expo-localization, like
    swift's DateFormatter .short style.
  - settings: one rounded block per section (16dp corners, swift 10), 56dp
    rows with a ripple, m3 switches tinted with the palette accent. the whole
    switch row toggles and reads as one switch to talkback (on ios only the
    switch toggles, like swift's Toggle row). appearance rows open an m3
    selectable dropdown menu anchored under the value; long values
    truncate before the chevron.
  - app alerts ("Pause...", Remove Demo Data, delete log, health connect and
    data import/export dialogs including the Save to Device / Share chooser,
    errors) are jetpack compose m3 dialogs tinted from the palette; ios keeps
    UIAlertController.
    a single-button alert cannot be dismissed with back or the scrim, like
    android's own `Alert.alert` default. without a mounted host (the
    headless notification task) android falls back to `Alert.alert`.
  - sheets (timeline 0.82/1.0, guide 0.6/1.0) are react-native-screens
    material bottom sheets with 28dp corners and a 32x4dp drag handle drawn
    by the screen (react-native-screens draws ios' grabber only); the close
    control is an "X" icon button instead of the blue "Done", and the log
    editor closes with an "X" instead of "Cancel".
  - every tappable control has a ripple bounded to its shape (icon buttons
    an unbounded 24dp one with a 48dp target); ios dims pressed controls.
  - haptics use android's own constants (`src/services/haptics.ts`): segment
    tick for display mode / theme color, gesture start, clock tick and
    confirm on the circular time picker; ios keeps swift's impact styles.
  - cards keep a tuned translucent tonal fill per palette (`cardBackground`)
    with elevation instead of a real blur: expo-blur's android blur needs a
    BlurTargetView around the starfield and costs a blur pass per frame.
  - large numerals: android has no rounded system face (swift `.rounded`),
    so they stay roboto with tabular digits.
  - chart cards on narrow widths (320dp, large text) wrap the value and the
    90D/All chip onto a right-aligned second line instead of overflowing.
  - while asleep the palette swaps to its desaturated version on both
    platforms (swift grays the whole root with `.grayscale(1.0)`); android
    additionally grays the emoji (greeting, "😴 mode activated", tips) with a
    render effect on those texts. a root-wide filter measured ~1.7x slower
    frames on the emulator, and ios react native has no grayscale filter,
    so ios emoji stay in color.
  - the welcome moon's glow blurs icon copies with a render effect (swift
    `.blur(radius:)`); ios keeps its native shadow glow.
  - logs: besides the swipe, a long press deletes after a confirm dialog and
    talkback gets a "Delete" action (ios keeps tap-to-edit for any hold).
  - predictive back is on (`predictiveBackGestureEnabled`); the back edge
    swipe closes the log editor and the back key closes the wind-down tips
    without errors (checked on android 16). back on Metrics, Logs or
    Settings returns to Home first.
  - a system font size change recreates the activity (android's default):
    react native 0.88 does not relayout existing text when the font scale
    changes in place. open editor state is lost, and dev builds log a
    one-off "configured linking in multiple places" warning while the old
    root unmounts; only one root remains.
- logs swipe (both platforms): a full left swipe deletes like swift's
  default `.swipeActions` and the row tracks the finger 1:1. on a full
  swipe the row snaps back to the delete button before it is removed,
  where swift slides it off (visual only).
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
  minute-oracle and both dst transitions. the guide's SRI copy says "including
  imported Health Connect sleep" on android and drops the clause on ios,
  which has no health import.
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
  - a swipe is respected: android 14+ lets users swipe even an ongoing
    notification away (except on the lock screen), so the sleep
    notification carries a delete intent and is keyed by its session
    (`sleep:<start>`). a swiped one stays away for that session: it is not
    reposted on foreground, on relaunch, on a goal or bedtime change or
    after a reboot, and its minute refresh stops. the next session shows it
    again, and so does turning Sleep Notification off and on. android 13
    and older cannot swipe it. (ios recreates a dismissed live activity on
    the next relaunch, as before.)
  - within 3 hours of bedtime (no session): "Winding down...", a countdown
    chronometer to bedtime, "Bedtime at <time> - dim the lights" and a Start
    Sleep action; android removes it at bedtime by itself. it can be swiped
    away, and a dismissed countdown stays away until the bedtime changes.
    like the ios countdown it is posted only when the app comes to the
    foreground inside the window; no alarm schedules it while the app is
    closed. a time zone or clock change removes a posted countdown (its
    bedtime may no longer be right); the next foreground reposts it in the
    new zone (hermes' Intl follows the zone change without a restart,
    checked on the android 16 emulator).
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
    the stored session. the widgets' minute refresh and the tile come back
    then too, with or without the notification.
- settings while a session is active (swift isBlocking): the orange lock
  row with swift's copy sits above Sleep Goal and the Wind-Down / sleep
  notification toggles are disabled; bedtime and wake stay editable like
  swift. the dev-only Development section has swift's red "Restart
  Onboarding" and "Reset Sleep Data" (deletes every session, the active one
  included; widgets, tile and notification follow through the usual
  session-change path), plus a port-only
  "Show Scheduled Notifications" row.
- onboarding steps after welcome (health connect, schedule, notifications,
  demo data) show swift's inline navigation bar with only the back control:
  the chevron in a 44pt bar on ios, the material 3 arrow_back icon button in
  a 64dp small top app bar on android. it is disabled while health connect
  connects or the demo data imports. the schedule step's sleep and wake
  times follow the device 12/24-hour setting (swift `Text(style: .time)`).
- settings "Go to settings to disable globally" (swift link at the end of
  Notifications, hidden while sleeping) opens the app's notification
  settings on android and the app's settings page on ios.
- android quick settings tile "Twilight Sleep Mode" (swift
  SleepModeControlWidget; `TwilightSleepTileService.kt` in
  `modules/twilight-widget-actions`, declared in the module's manifest, so
  no config plugin is needed): "Start Sleep" + moon, "Off", inactive while
  awake; "Wake Up" + sun, "On", active while asleep. tiles are monochrome,
  so swift's cyan moon / amber sun tints become the system's tile colors. a
  tap works like swift's `ToggleSleepModeIntent(shouldStart: !isOn)` with
  `openAppWhenRun`: it stores the pending action, collapses the shade and
  opens twilight (after unlocking on the lock screen), which runs it through
  the dashboard toggle with the "Pause..." messages. the edit list shows
  swift's display name; there is no description line on android.
- android launcher shortcuts (swift TwilightShortcuts app shortcuts; android
  has no siri phrases or intent dialogs): only the shortcut that applies is
  offered, "Start Sleep" (long label "Start Sleep Mode", moon) while awake
  and "Wake Up" (sun) while asleep, as dynamic shortcuts with adaptive
  night-sky icons in swift's tints. both can be pinned; a pinned shortcut
  that no longer applies opens the app with "Sleep mode is already active."
  / "Sleep mode is not active.". the shortcut intents carry the
  twilight://sleep/start|stop links but target a no-display trampoline
  activity that stores the pending action and opens the app, so android
  can neither swallow them (a link identical to the task's base intent is
  only "brought to front") nor replay them after process death. before the
  app has run once there are no shortcuts.
- the tile and the shortcuts read a native mirror of the session that js
  updates on every session change from any surface (`src/services/
  sleep-controls.ts`, wired to the app store, so the headless notification
  task updates it too); a session notification press updates it at once
  natively, and the app republishes the mirror on every foreground so a
  change it missed (or a rate-limited shortcut update) catches up. swift
  reloads the control on every change the same way. pending presses keep
  one slot per origin (swift has one slot): a widget, tile or shortcut
  press never replaces a session notification press that has not been
  applied yet, and the app applies both in press order. the
  tile is an active tile (`ACTIVE_TILE`): each change redraws it in the
  shade even while the shade is closed, and a tile that systemui still
  holds after a tap is redrawn in place.
- rating prompt (swift RatingManager): swift never calls
  `incrementLaunchCount()`, so the swift app never asks. the port wires it
  with swift's rule (once per app version, from the third launch) through
  expo-store-review (play in-app review / SKStoreReviewController). launches
  count once per ui process (headless starts do not count) in the kv store
  (`twilight.rating.*`). port addition: the prompt is asked 2 s after the
  launch (a sleep link resolves asynchronously) and only while the app is
  in front, past onboarding and awake; otherwise it waits for the next
  launch. an android app alert on screen (the "Pause..." dialog of a
  cold-start widget press) postpones it until the alert is answered. the
  version is claimed before asking, like swift, so a device without the
  play store uses up the prompt for that version. the store's own quota
  decides whether the sheet actually shows; without the play store nothing
  happens.
- circular time picker: minutes and the centre duration are rounded from the
  knob angle. swift truncates with `Int()`, and ieee754 puts 14 of the 288
  snapped 5-minute angles just below the integer, so dragging to 7:40 saved
  7:39, and about 8% of start/end pairs showed a duration one minute short
  (23:10 -> 06:50 read 7h 39m). the 18:00 hour marker reads "6 PM" (swift:
  "18 PM", next to "6 AM").

## health connect sync (android) vs swift healthkit sync

design and every decision: docs/health-connect.md (2.10, 11). in short:

- health connect replaces healthkit on android; ios has no health sync (no
  healthkit in this port) and never calls the module.
- one `SleepSessionRecord` per twilight night with one sleeping stage, client
  record id `twilight.sleep-session.<id>` (swift sync identifier), per-end
  zone offsets instead of one zone id, recording method manual entry for
  "Manual Log" and actively recorded for tracked nights.
- ownership is by data origin package only; a twilight-prefixed record from
  another package is foreign (swift also trusted the prefix).
- reads use a changes token and a local mirror of foreign records instead of
  re-reading all history every sync; one reconcile per pass over the mirror.
- versions are clock based and bumped on every edit, and "mark synced" is a
  compare-and-set, so an edit during a write is never lost (swift defect 1).
- local deletions go to a persistent outbox and a deletion ledger, also while
  sync is off, so deleted nights never come back (swift defect 2).
- night keys use the wake day from the record's end offset, and updates match
  by record ids first, so source edits and travel no longer re-key nights
  (swift defect 3). informational pull results are not errors (defect 4);
  an update-only pull says "Updated N night(s)" (defect 5).
- deleting an import also tombstones other apps' copies of that night
  (defect 6); a moved adopted night is not imported again (defect 7);
  imports without links (restored) are never deleted by absence (defect 8);
  a manual log over an import replaces it (defect 9).
- edited imports stay local and are never written to health connect (hc
  write-back guidance); swift exports them.
- deletions of twilight records in health connect never delete the local
  night silently: recent ones are held for a decision, nights older than 30
  days only stop exporting. swift ignores such deletions.
- imports whose records disappear after 30 days (hc auto-delete) are kept as
  detached imports; swift deletes vanished imports.
- a night that starts in the future (the editor allows any wake day) waits,
  pending and without an error, until it starts: health connect rejects a
  record whose start lies ahead, and that rejection would poison the night.
  healthkit accepts future samples.
- reads run only in the foreground; a background request is outbound only.
- force resync repairs differences instead of rewriting every record.
- android auto backup restores are detected with a no-backup install id and
  reset device-bound sync state once.
- the swift 800 ms empty-import retry is not ported: on the emulator the
  first read right after a fresh grant returned every record, including the
  45-day-old one (docs/health-connect.md 2.10 item 10, 13).

ui (docs/health-connect.md 5 and 12):

- the AppleHealthSettingsView states map to health connect states: plus
  `updateRequired` (provider update), `hidden` (sdk unavailable and sync off:
  no row, no screen, no onboarding step) and partial grants. "Open Settings"
  becomes "Open Health Connect"; on android 14+ it lands on health connect's
  "Data and access" because the per-app page is closed to third-party apps.
- write-only access is a connected state whose primary action is "Sync now"
  (outbound) instead of "Pull from Health Connect"; the hero, row and tips
  name the missing direction. swift has no partial states (healthkit hides
  read status).
- denied always routes to Open Health Connect, never re-requests: on the
  emulator, health connect stopped showing its dialog after one denial that
  followed a revoke.
- a held-deletion card ("Health Connect removed N Twilight night(s)", Keep
  in Twilight / Remove from Twilight) is new; swift ignores remote deletions.
- the last pull result is an informational line in the status card, never in
  the error card (swift defect 4).
- if health connect itself is disabled, "Open Health Connect" shows an
  alert saying where to find it instead of doing nothing.
- the screen keeps swift's card order and copy with "Apple Health" replaced;
  the action area sits below the scroll view like swift's safe-area inset.

## data archive (both platforms) vs swift DataArchiveManager / DataExporter

design: docs/health-connect.md 6 and 13.

- own archive type `twilight-expo-backup` schema 1, because swift backups
  embed app-blocking profiles this port cannot produce; a port file must never
  half-import into swift. the port reads swift `twilight-full-backup` schema
  1-2 one way (the sleep profile's sessions, sleep settings, appearance,
  tombstones; profiles, scheduler state and breaks are skipped) and never
  writes swift archives. healthkit imports and edited healthkit nights from a
  swift backup stay local and are never exported to health connect.
- field names say `health` instead of `healthKit`; new fields:
  `isHealthAdopted`, `healthProvider`, `metadata.platform`, tombstone
  `recordIds`. missing optional keys decode to defaults (swift parity for
  tombstones).
- `healthSyncEnabled` is exported but never restored: it is device and
  permission state (swift restores it).
- restored owned nights become pending with a fresh clock version above the
  file's and the local one; swift copies the file's sync flags, which on
  health connect would let an older record silently win.
- device-bound health connect state (record ids, written flags, mirror,
  links, token, outbox, deletion ledger) is never exported and never taken
  from a file. restored imports arrive detached and re-link when a health
  connect night matches their key, so the absence rule never deletes them
  (swift defect 8). restoring a deleted night clears its deletion ledger row
  and its pending remote delete.
- the preview counts a session as updated only when its content changed;
  sync bookkeeping alone is not an update (swift compares the whole record).
- if the device already has an active session, the backup's active session
  is skipped (swift imports it and keeps "the most recent" authoritative,
  which can leave two active sessions).
- stricter validation with clear copy: end after start, at most one active
  session, valid time zones, minutes 0-1439, theme and provider values
  ("This backup contains an invalid sleep session (id).", "This backup
  contains more than one active sleep session.", "This backup contains
  invalid settings (field)."). "This file is not a Twilight backup." drops
  swift's "full".
- pre-import safety backups go to `<documents>/DataBackups` (swift:
  application support) and only the newest 10 are kept (swift keeps all).
- demo isolation: the Data section is hidden while sample data is active
  (swift parity), the screen redirects to Settings during demo, and demo
  sessions are never exported or imported.
- markdown export: "-" instead of the em dash, "In Progress" / "Completed"
  instead of emoji, one profile named "Sleep", "Each session represents a
  single sleep period."; the break rows and csv break columns stay empty for
  format parity. the session export button is always enabled (swift disables
  it without profiles; the port always has its one profile).
- android "Save to Device": every export (backup, csv, markdown) first asks
  "Save to Device" or "Share" in a material dialog. save opens the system
  create-document picker (storage access framework; Downloads or any folder,
  editable file name) through the local kotlin module
  `modules/twilight-document-save`, and a toast confirms "Saved <file>". the
  android share sheet offers no local save target (only Quick Share, Drive,
  Gmail), and a folder-tree picker cannot choose Downloads. swift and ios rely
  on the share sheet's "Save to Files". the import picker on android also
  accepts files labeled text/plain or octet-stream, because some providers
  mislabel .json files.
- the settings row icon is `externaldrive`: swift's
  `externaldrive.badge.arrow.up.and.down` is not an SF Symbols 7 name. no
  analytics events (telemetrydeck is out of scope).

