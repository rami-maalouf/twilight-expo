# deviations from the original swift app

every intentional difference between this port and the swift source, with reasons.
spec-sanctioned scope cuts are listed first; implementation-time deviations follow.

## scope cuts (pre-agreed in test-3-spec.md)

- app blocking (FamilyControls/ManagedSettings), NFC/QR flows, storekit tip
  jar, telemetrydeck, BGTaskScheduler, demo-data manager, app
  intents/shortcuts/control-center widget, break-glass flow, session breaks:
  all out of scope per the spec's decisions section. healthkit sync is not
  ported to ios; android gets the health connect equivalent (below). the
  spec also cut data export/archive; it is now ported on both platforms
  (see "data archive" below).
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
  minute-oracle and both dst transitions. the guide's SRI copy says "including
  imported Health Connect sleep" on android and drops the clause on ios,
  which has no health import.
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

