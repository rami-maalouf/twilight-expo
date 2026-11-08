# deviations from the original swift app

every intentional difference between this port and the swift source, with reasons.
spec-sanctioned scope cuts are listed first; implementation-time deviations follow.

## scope cuts (pre-agreed in test-3-spec.md)

- app blocking (FamilyControls/ManagedSettings), NFC/QR flows, storekit tip
  jar, telemetrydeck, BGTaskScheduler, data export/archive, app
  intents/shortcuts/control-center widget, break-glass flow, session breaks:
  all out of scope per the spec's decisions section. healthkit sync is not
  ported to ios; android gets the health connect equivalent (below). the
  archive is planned (docs/health-connect.md 6) and still missing.
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
- swift 0.10 apple health import: the sync core (tombstones, clusterer,
  reconciler, two-way sync) is ported to health connect on android. its ui
  (onboarding step, settings screen, "Pull from Health Connect" empty state)
  is not built yet, so sync cannot be turned on from the app; dev builds
  can start it through `globalThis.__twilightHealthSync.enableSync()`.

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
- reads run only in the foreground; a background request is outbound only.
- force resync repairs differences instead of rewriting every record.
- android auto backup restores are detected with a no-backup install id and
  reset device-bound sync state once.
- the swift 800 ms empty-import retry is not ported (not needed so far on
  the emulator; docs/health-connect.md 2.10 item 10).

