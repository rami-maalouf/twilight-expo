# health connect two-way sleep sync and data archive: design

status: design, hardened by an adversarial critique (section 10 lists every
issue found and its resolution). ready for implementation on
`feat/health-connect`. where this text and section 10 disagree, the body
text is the decision; section 10 explains why.
scope: android two-way sleep sync with health connect (hc), swift-equivalent
backup export/import and session export on both platforms. ios gets the
archive only; every hc surface is hidden on ios.

sources read for this design:

- swift (read-only): `Twilight/Utils/HealthKitSleepSyncManager.swift`,
  `HealthKitSleepReconciler.swift`, `HealthKitSleepNightClusterer.swift`,
  `Models/HealthKitSleepTombstone.swift`, `Models/BlockedProfileSessions.swift`,
  `Models/SleepSettings.swift`, `Views/AppleHealthSettingsView.swift`,
  `Views/Onboarding/AppleHealthOnboardingStepView.swift`,
  `Views/SleepOnboardingView.swift`, `Views/HomeView.swift`,
  `Views/SleepDashboardView.swift`, `Views/BlockedProfileView.swift`,
  `Views/Logs/SleepLogsView.swift`, `Views/Logs/SleepSessionEditorView.swift`,
  `Views/BlockedProfileDataExportView.swift`, `Utils/DataArchiveManager.swift`,
  `Utils/DataExporter.swift`, `Utils/DemoSleepDataManager.swift`,
  `twilightTests/HealthKitSleepSyncTests.swift`,
  `twilightTests/DataArchiveTombstoneTests.swift`.
- prior art (read-only): `twilight-rn` branch `feat/android-parity`
  (`modules/twilight-health-connect`, `plugins/with-health-connect.js`,
  `src/lib/health/*`, `src/lib/archive.ts`).
- this repo: `src/data/*`, `src/domain/models.ts`, `src/state/*`,
  `src/demo/*`, `src/app/**`, `.gitignore`, `package.json`, `app.json`.
- health connect docs (developer.android.com): get-started, read-data,
  write-data, sync-data, data-types, `SleepSessionRecord` reference,
  connect-client release notes (stable 1.1.0, alpha 1.2.0-alpha06).
- re-verified during the critique (quotes in section 10): sync-data
  (upsert rule, store ids, changes loop, token expiry strategies, foreground
  reads), read-data (30-day rule, own-data rule per android version,
  uninstall resets the window, page token `""`), write-data (version value
  check, "data read from health connect shouldn't be written back",
  recording method and device type mandatory, 1000 records per request),
  `HealthConnectClient` reference (`insertRecords` and `deleteRecords` are
  all-or-nothing transactions; deleting a non-existing id throws
  `RemoteException`; tokens valid 30 days; `SDK_UNAVAILABLE` -> "apps should
  hide any integration points"), release notes 1.1.0-alpha11 ("reads
  without [history] permission only fail when attempting to read a single
  data point"), rate-limiting guide, google support "delete your data from
  health connect" (auto-delete removes data older than a chosen period each
  day; "delete app data" per app).
- expo modules api docs: `AsyncFunction ... Coroutine`, `OnActivityResult`,
  `RegisterActivityContracts` / `registerForActivityResult`.

---

## 1. swift behavior inventory

### 1.1 persisted state

| state | where | meaning |
|---|---|---|
| `healthSyncEnabled` | `SleepSettings` (UserDefaults) | user switch for sync |
| `needsHealthKitSync` (default `true`) | session | session must be (re)written to health |
| `healthKitSyncVersion` (default `2`) | session | payload version, written as `HKMetadataKeySyncVersion` |
| `isHealthKitImported` | session | session is a health-owned import |
| `healthKitExternalNightKey` | session | identity of the imported night |
| `healthKitSourceBundleIdentifier` | session | source app of the import |
| `HealthKitSleepTombstone(nightKey, deletedAt)` | swiftdata, unique key | night the user deleted locally; never re-import |
| query anchor | UserDefaults `healthKitSleepSync.queryAnchor` | saved but not used for reads ("future optimizations") |
| imported sample uuid map | UserDefaults `healthKitSleepSync.importedSampleUUIDs` | session id -> health sample uuids |

in-memory state: `authorizationState` (`unavailable`, `notDetermined`,
`denied`, `authorized`), `isSyncingHistory`, `lastErrorMessage`,
`lastPullResult`, `inFlightSyncIdentifiers`, `inFlightDeletionIdentifiers`,
`isBidirectionalSyncRunning`.

constants: `minimumHealthKitSyncVersion = 2`, `appleHealthImportTag = "Apple Health"`,
`healthKitSyncIdentifierPrefix = "twilight.sleep-session."`,
`minimumDuration = 5 min`, clusterer `maxGapBetweenSamples = 3 h`.

### 1.2 ownership rule

- twilight-owned = `!isHealthKitImported`. only twilight-owned sessions are
  exported, updated and deleted in health.
- imported = health-owned. never written back. local delete removes it from
  twilight only and writes a tombstone so it does not come back.
- adoption: editing an imported session (`markHealthKitSyncPending(afterEdit: true)`)
  calls `adoptFromHealthKitImport()`. the flag flips to owned, the night key
  stays. the session then exports like any twilight night.
- authorship of a health sample: source bundle == app bundle, or sync
  identifier starts with `twilight.sleep-session.`.

### 1.3 payload versioning

- `markHealthKitSyncPending(afterEdit:)`: raise version to the minimum; if
  `afterEdit && !needsHealthKitSync` then `version += 1`; set `needs = true`.
- `prepareForCurrentHealthKitPayload()`: version below minimum -> set to
  minimum, `needs = true`. runs before every outbound pass.
- `forceHealthKitResync()`: `version += 1`, `needs = true` for every valid
  owned session.
- `markHealthKitSynced()`: `needs = false`, unconditional.
- outbound sample: `HKCategorySample` `asleepUnspecified`, start..end, metadata
  sync identifier `twilight.sleep-session.<id>`, sync version, one time zone
  (`end ?? start`), `wasUserEntered = tag == "Manual Log"`, plus twilight
  session id, profile id/name, start and end zone ids.

### 1.4 triggers

| trigger | swift call | what runs |
|---|---|---|
| enable (onboarding or settings connect) | `enableSync` | request read+write, set enabled, `syncBidirectional(retryEmptyImport: true)` |
| app appear, foreground (`scenePhase == .active`), onboarding finished | `syncPendingSleepSessions` | `syncBidirectional` |
| session ended (`endSession`) | `syncSessionIfNeeded(self)` | outbound for one session |
| editor save (new or edit) | `syncSessionIfNeeded` | outbound for one session |
| log delete (logs, profile list, dev reset) | `handleLocalDeletion` then `context.delete` | tombstone if night key, then delete health samples if owned |
| onboarding finish | `importIfNeeded` (awaited before `isOnboarded = true`) | `syncBidirectional` |
| dashboard empty-state "Pull from Apple Health" | `forceResyncSleepHistory` then alert with `lastPullResult.message` | forced resync |
| settings "Pull from Apple Health" | `forceResyncSleepHistory` | forced resync |
| archive import | `syncPendingSleepSessions` if enabled | `syncBidirectional` |
| disable | `disableSync` | enabled = false, clear anchor, clear uuid map |

guards on every path: enabled, authorized, sleep profile exists, profile is
not the demo profile.

### 1.5 bidirectional sync

1. `runExclusiveHealthKitSync`: busy-wait loop (50 ms) until no sync runs.
2. inbound `importSleepHistory`: read ALL sleep samples every time (anchor not
   used, "anchored deltas alone can mis-cluster partial nights"), snapshot,
   cluster, reconcile against all local sessions with the tombstone set,
   apply actions, rehydrate orphans, remove vanished imports, save, store the
   uuid map, save an anchor.
3. if `retryEmptyImport` and zero samples: wait 800 ms and read again.
4. outbound `syncSleepHistory`: prepare payload versions (or force), then for
   each ended, valid, owned, `needs` session: build sample, save, mark synced.
5. `lastErrorMessage = pull.message` when nothing was inserted or rehydrated,
   else nil (so "already has matching nights" shows in the error card).

### 1.6 clusterer rule

- foreign samples only (not twilight-authored), kinds `asleep` and `inBed`,
  `end > start`.
- group by source bundle; sort by start then end; split when
  `next.start - last.end > 3 h` (gap measured from the previous sample's end).
- night envelope: min start / max end of `asleep` samples, else `inBed`
  samples. drop nights shorter than 5 min.
- `nightKey = "<source>|<startOfDay(end) epoch s>|<start epoch s>"` with
  `Calendar.current`.
- night zone: first non-nil zone of envelope samples, else any sample.
- kind mapping: core/deep/rem/unspecified -> asleep, inBed -> inBed,
  awake -> awake, unknown future values -> asleep.
- orphans: twilight-authored samples whose session id (from sync identifier)
  is not local; envelope `asleep`, else `inBed`/`other`; min 5 min; rehydrated
  as `tag "Manual Log"`, owned, `needs = false`, version = minimum, both zones
  = sample zone or current.

### 1.7 reconciler decision

nights sorted by start ascending; per night, first match wins:

1. `skipTombstoned` if the night key is tombstoned.
2. `updateImported(sessionID, night)` if an imported session has the same key.
3. `skipOverlapsTwilightOwned` if any owned session overlaps.
4. `skipOverlapsImported` if any imported session overlaps.
5. `insert(night)`.

in-batch: an `insert` that overlaps an earlier accepted insert becomes
`skipOverlapsImported(existingSessionID: <kept nightKey>)`.
overlap: `nightStart < (sessionEnd ?? distantFuture) && sessionStart < nightEnd`.
`updateImported` applies only when start, end or key changed.
after actions: imported locals whose key is not in health and not
tombstoned are deleted ("drop local imports that health no longer has").
`deletionAction` (tested, not wired): ignore deletions of twilight-authored
samples; delete an imported session when any of its sample uuids was deleted.

### 1.8 time zones

- session stores start and end zone ids; `endTimeZone` falls back to start.
- export writes one zone (`end ?? start`), warns when start != end, refuses
  sessions without a valid zone (`missingTrackedTimeZone`).
- import: one zone for both ends, from sample metadata, else current zone.
- night key wake day uses the device calendar (`Calendar.current`).

### 1.9 errors and user copy (swift)

errors: unavailable "Apple Health is unavailable on this device.";
permissionDenied "Twilight needs Apple Health permission to sync sleep
sessions."; invalidInterval "This sleep session has an invalid sleep/wake
interval."; missingTrackedTimeZone "This sleep log is missing the time zone it
was recorded in. Edit and save the log before syncing it to Apple Health.";
saveFailed "Apple Health rejected this sleep session."; deleteFailed
"Twilight couldn't remove the matching Apple Health sleep entry."

skip messages: "Apple Health sync is turned off.", "Twilight does not have
Apple Health permission.", "Create a sleep profile before pulling Apple Health
data.", "Demo data does not sync with Apple Health."

pull messages: empty, "Found N ... but Twilight already has matching
nights or they overlapped local sleep.", "Imported N night(s) from Apple
Health (K sample(s))."

ui states (settings): `connected`, `readyToEnable`, `notDetermined`,
`denied`, `unavailable`, `demo`. onboarding: same without `demo`.

### 1.10 swift defects this port fixes (found while reading)

1. lost edit race: `markHealthKitSynced()` is unconditional. an edit made
   while the write is in flight does not bump the version (needs is still
   true), then the flag is cleared, and the edit never syncs.
2. resurrection: a local delete while sync is off or unauthorized skips the
   health delete. a later sync rehydrates the session as an orphan.
3. night key churn: the key embeds the cluster start and the device-zone wake
   day. a source edit of the start, or travel, changes the key, so the update
   path misses, the import is dropped and re-inserted, and a tombstone stops
   matching (the deleted night comes back).
4. informational pull messages land in `lastErrorMessage` and render in the
   "Something needs attention" card.
5. an update-only pull says "Imported 0 night(s) ..." because the message
   counts inserts and rehydrations but the branch condition also counts
   updates.
6. other-source comeback: two apps record the same night; the reconciler
   imports one and skips the other as `skipOverlapsImported`. when the user
   deletes the import, only its night key is tombstoned, so the next pull
   imports the other app's copy of the same night.
7. adopted duplicate: after an imported night is adopted (edited), the
   reconciler matches only imported sessions by key. if the source app then
   moves that night so it no longer overlaps the adopted session, it is
   inserted again as a new import next to the adopted copy.
8. restore wipe: an archive restored onto a device whose health store does
   not hold the source samples loses every restored import on the next pull
   ("drop local imports that health no longer has").
9. superseded import: a manual log for a night that is already imported
   leaves both sessions in the journal; the import keeps updating.

---

## 2. mapping to health connect

### 2.1 record mapping

| swift / healthkit | health connect | decision |
|---|---|---|
| `HKCategorySample` sleepAnalysis | `SleepSessionRecord` (one per night) | one record per twilight session |
| `asleepUnspecified` value | `stages = [Stage(start, end, STAGE_TYPE_SLEEPING = 2)]` | one sleeping stage over the full session (parity with "unspecified asleep") |
| `HKMetadataKeySyncIdentifier` | `metadata.clientRecordId` | `"twilight.sleep-session.<session id>"`, same prefix as swift |
| `HKMetadataKeySyncVersion` | `metadata.clientRecordVersion` (Long) | `health_sync_version`, a clock-based monotonic value (see 3.3) |
| `HKMetadataKeyTimeZone` (one zone) | `startZoneOffset`, `endZoneOffset` | per-end offsets from the session's start and end iana zones at each instant (kotlin `ZoneId.rules.getOffset`), dst-correct |
| `HKMetadataKeyWasUserEntered` | recording method + device | `Metadata.manualEntry(device = Device(type = TYPE_PHONE), ...)` for `tag == "Manual Log"`; `Metadata.activelyRecorded(device = Device(type = TYPE_PHONE), ...)` for tracked sessions. recording method and device type are mandatory since 1.1.0-alpha12 / rc01. adopted imports are never written (2.5) |
| twilight custom metadata keys | none (hc has no free metadata) | session id is recoverable from `clientRecordId`; zones from offsets |
| `sourceRevision.source.bundleIdentifier` | `metadata.dataOrigin.packageName` | ownership by origin (2.2) |
| sample uuid | `metadata.id` (record id) | stored for deletion changes (hc docs: `DeletionChange` carries only the id) |
| title, notes | `title = null`, `notes = null` | twilight writes nothing user-visible beyond the session |

stage mapping on read (`SleepSessionRecord.STAGE_TYPE_*`, values verified
against the reference): `SLEEPING 2`, `LIGHT 4`, `DEEP 5`, `REM 6`,
`UNKNOWN 0`, and any unlisted future value -> asleep (swift: unknown counts as
sleep); `AWAKE 1`, `OUT_OF_BED 3`, `AWAKE_IN_BED 7` -> awake.

record-to-sample rule:

- record with at least one asleep stage -> one asleep sample per asleep
  stage, plus one `inBed` sample over the session interval.
- record with NO stages -> one asleep sample over the session interval. a
  stage list is optional in hc, and a session without stages is hc's
  equivalent of `asleepUnspecified` (twilight itself writes one sleeping
  stage, other manual-entry apps often write none). the first draft mapped
  this to `inBed`, which dropped such a record from the envelope whenever a
  staged record of the same source sat within 3 h.
- record with only awake stages -> one `inBed` sample over the session
  interval.

the clusterer then keeps the swift "prefer asleep over in-bed" envelope
rule unchanged.

### 2.2 ownership on health connect

- own record: `dataOrigin.packageName == <app package>`, and only that. hc
  docs: "only take changes that didn't come from the calling app".
- the swift prefix rule (`syncIdentifier` starts with
  `twilight.sleep-session.`) is NOT used for ownership on hc. a
  `clientRecordId` is scoped to the writing app, so a record from another
  package with the twilight prefix (a debug variant, a seeder, an app that
  copies records) is one that twilight cannot update or delete. treating it
  as own would rehydrate it as an owned orphan, export it again under
  twilight's package (a duplicate), and then fail every delete. it is a
  foreign record and goes through the normal import path, where the overlap
  rules stop duplicates.
- "own" therefore means exactly "twilight may update and delete it".
- foreign record: everything else. only foreign records are clustered and
  imported. this is the echo-import guard.
- hc only lets an app update or delete its own records. twilight can never
  modify a foreign record, which matches the swift rule.

### 2.3 reading: changes token instead of full reads

swift re-reads all history on every sync. hc limits reads, so the port uses
the differential changes api and a local mirror:

- `getChangesToken(ChangesTokenRequest(setOf(SleepSessionRecord::class)))`,
  one token for sleep only (hc docs: separate tokens per data type).
- the token is taken BEFORE a full read so writes that land during
  pagination arrive in the next `getChanges`.
- `getChanges(token)` in a loop until `hasMore == false`. each page is applied
  in one sqlite transaction together with `nextChangesToken`. a page
  transaction changes ONLY the mirror, own-record learning and the held
  remote-deletion queue. it never inserts, updates or deletes sessions.
- foreign upserts and deletions update the mirror table `hc_records`.
- reconcile runs ONCE per inbound pass, after the last page (or after the
  full read), over the whole mirror, in its own transaction. it runs on every
  inbound pass, also when no page had changes. reasons: (a) a source app
  that deletes and re-inserts a night (a common re-sync pattern) can put the
  delete and the insert on different pages; per-page reconcile would delete
  the import and insert a new session with a new id; (b) if the app dies
  between the last page commit and reconcile, the next pass still reconciles
  the committed mirror, because the mirror, not the change feed, is the
  source of truth. reconcile is a pure function of mirror + locals +
  tombstones + links, so running it again is idempotent.
- own upserts are not imported. they teach the engine `hc_record_id` and the
  remote `clientRecordVersion` for the session (3.3 self-heal). they do NOT
  rehydrate orphans: the change feed can replay an upsert of a record that
  was deleted later in the same feed, and a page-level rehydration would
  bring back a night the user deleted. orphans are rehydrated only from a
  full own read (a snapshot of what exists now), and never for a session id
  in the deletion ledger (2.6).
- own deletions: see 2.6.

foreground only: hc docs "apps can only read data from health connect while
they are in the foreground ... access may be interrupted at any point". the
engine runs inbound only when `AppState.currentState === 'active'`. a
`SecurityException` during a read is followed by `getGrantedPermissions()`:
still granted -> transient interruption (no error card, retry next
foreground); revoked -> permission state and copy. no partial page or
partial full read is ever committed.

token expiry: a token is valid for 30 days after it is generated
(`HealthConnectClient.getChangesToken` reference); an expired token returns
`changesTokenExpired == true`. an invalid token (for example a token
restored from another device, 4.6) is not documented; the engine treats any
`getChanges` exception other than `SecurityException`, rate limit or
`IOException` as an invalid token, once per run. the engine does NOT surface
an error (prior art did). it clears the token and runs a full re-read with
dedupe (hc docs "read and dedupe all data", the recommended strategy). dedupe
is natural: the mirror is keyed by record id, imports by night key and
record ids.

### 2.4 read window, history permission

- default: an app reads other apps' data only back to 30 days before the
  first permission grant. on android 14+ an app reads its own data with no
  limit; on 13 and lower the 30-day limit also applies to own data.
- `android.permission.health.READ_HEALTH_DATA_HISTORY` removes the limit. it
  is requested together with read and write when the feature is available
  (`features.getFeatureStatus(FEATURE_READ_HEALTH_DATA_HISTORY)`). it is
  optional; denying it keeps sync working.
- verified behavior of the limit (release notes 1.1.0-alpha11): "reads
  without this permission only fail when attempting to read a single data
  point". a RANGE read older than the window does not throw; hc silently
  returns only the readable part. so the engine can never learn the window
  from errors, and an absent record is not proof of deletion.
- uninstall revokes every permission, and after reinstall the window is 30
  days before the NEW grant (read-data "permissions history for a deleted
  app"). it is not documented whether a revoke-all and re-grant without
  uninstall also moves the window.
- full read = two range reads, both from epoch to now (safe because range
  reads trim instead of failing): own records (`dataOriginFilter = own
  package`) for orphans and id/version learning; all records for the foreign
  mirror (own records in that result are dropped).
- absence rule (evidence based, replaces the first draft's stored
  `coverageStart`): during a full read, an imported session is "vanished"
  only if all of these hold:
  1. it has at least one row in `hc_import_links` (it was matched to records
     in THIS hc store; imports restored from an archive or another device
     have no links and are never deleted by absence, 6.4);
  2. none of its linked record ids is in the foreign read result;
  3. the read proves the night was readable: history permission granted, or
     the read returned at least one FOREIGN record whose start is at or
     before the night start. own records do not count: on android 14+ own
     data has no limit, so an old own record proves nothing about the
     foreign window.
  otherwise the import is kept and its links stay. the first draft used
  `firstGrantedAt - 30 days`, which is wrong after an auto-backup restore
  (4.6) or a revoke and re-grant, and then deletes imports that hc merely
  did not return.
- `firstGrantedAt` stays only for ui copy (the read-window tip).
- own data: android 14+ reads own data with no limit; android 13 and lower
  applies the 30-day limit to own data too (read-data "read previously
  written data"). on 13 and lower without history permission, orphan
  rehydration after reinstall covers only the last 30 days. documented, no
  workaround.
- page tokens: loop until `pageToken.isNullOrEmpty()` (hc note: some versions
  return `""`).

### 2.5 writing

- `insertRecords` upserts by `clientRecordId`. hc overwrites only when the new
  `clientRecordVersion` is HIGHER than the stored one; otherwise "the process
  ignores the change and the value remains the same" (write-data "value check
  in client record version"). equal versions are ignored too. the ignore is
  silent: no exception, and the docs do not say which id the response
  returns in that case. swift healthkit replaces on any version, so the port
  must guarantee strictly increasing versions without depending on a read
  (3.3).
- `insertRecords` is one transaction: "if one fails, none is inserted"
  (reference). batches of at most 50 writes (docs limit is 1000 per
  request; small batches keep a failure local).
- failure handling by error code (rate-limiting guide: "retry from where the
  exception occurred", do not retry everything):
  - `E_HC_INVALID` (`IllegalArgumentException`, a validation failure): retry
    that batch one record at a time; a record that fails alone gets
    `hc_error_code = 'invalid'` and `hc_error_version = health_sync_version`
    and is skipped until its version changes (an edit). without this marker
    one bad record would be rewritten on every foreground forever. the
    error card names the night date with the "rejected" copy.
  - `E_HC_RATE_LIMIT`: stop outbound for this run. no per-record retry
    (that would burn quota). state stays pending.
  - `E_HC_PERMISSION`: re-read permissions, stop outbound.
  - `E_HC_REMOTE` / `E_HC_IO`: stop this run, retry next trigger.
- write-ahead flag: `hc_written = 1` is set in sqlite BEFORE the upsert call
  for each session in the batch. it means "a twilight record may exist in
  hc". the deletion outbox depends on it (2.6). it is never cleared except
  by a confirmed remote deletion or the device-restore reset (4.6).
- returned record ids are stored in `hc_record_id` together with the
  compare-and-set mark (3.3). own upsert changes also carry the id, so a
  crash between write and store self-heals on the next changes pass.
- adopted imports are NOT written. hc write-data guidance: "if your app has
  read data from health connect, that data shouldn't be written back into
  health connect", and "the responsibility falls onto the other app to write
  its own data". writing an edited copy also leaves two overlapping sleep
  sessions in hc for every edited night (the foreign original cannot be
  changed by twilight). swift exports adopted nights; the port keeps the
  edit local (deviation, listed in 2.10). only nights that twilight tracked
  or the user logged in twilight are exported.
- delete: see 2.6.
- an owned session that was exported and later becomes invalid (shorter than
  5 min) is deleted remotely through the outbox (swift leaves the stale
  sample).
- force resync ("Pull") is a repair, not a blind rewrite (swift rewrites
  every owned sample): after the full own read, the engine marks pending
  only owned sessions whose own record is missing for a reason other than a
  remote deletion (never written, `hc_written = 0`) or whose remote start,
  end, offsets or version differ from local. rewriting every record would
  spend write quota and turn the whole journal into own changes for no
  benefit.

### 2.6 deletions both ways

| deletion | swift | port |
|---|---|---|
| user deletes owned night in twilight | delete samples if enabled+authorized, else nothing (resurrection bug) | one transaction: delete row, add the session id to the deletion ledger `hc_deleted_sessions`, and enqueue `twilight.sleep-session.<id>` in the `hc_pending_deletions` outbox ONLY when `hc_written = 1`. the outbox drains on the next sync with write permission. orphan rehydration skips every ledger id, before and after the outbox drains |
| user deletes imported night in twilight | tombstone night key, health keeps original | tombstone the night key + its linked record ids + the record ids of every other-source mirror night that overlaps the deleted interval at that moment (fixes swift defect 6); hc keeps the originals (parity) |
| user deletes adopted night in twilight | tombstone night key, delete twilight samples | tombstone as for an import; no outbox row (adopted nights are never written, 2.5) |
| foreign app deletes its record in hc | night vanishes on next full read -> local import deleted | `DeletionChange` removes the record from the mirror; reconcile; the import updates (shrunk night) or is deleted when none of its records is left. retention exception below |
| user (or hc auto-delete) deletes a twilight record in hc | ignored (`deletionAction` -> `.ignore`) | never deletes the local journal silently; remote-deletion policy below |

#### the outbox and why deletes can fail

verified facts (`HealthConnectClient.deleteRecords` reference): the call is
one transaction ("if one fails, none is deleted"), and "deleting by invalid
identifiers such as a non-existing identifier or deleting the same record
multiple times will result in IPC failure" (`RemoteException`). the first
draft enqueued every owned deletion, including sessions that were never
written (created while sync was off, or with write denied). one such row
would fail its whole batch on every run: the outbox could never drain
(a poison row), and every later deletion would be stuck behind it.

rules:

1. enqueue only when `hc_written = 1` (2.5). sessions never written have
   nothing to delete.
2. the outbox row stores `client_record_id`, `hc_record_id` (if known),
   `start_ms`, `end_ms`, `attempts`, `last_error`.
3. drain in batches of 50 by client record id. on a batch failure, retry the
   batch one id at a time.
4. a single id that fails with `E_HC_REMOTE`:
   - read permission granted: read own records in `[start_ms - 1 day,
     end_ms + 1 day]`. no record with that client record id -> it is already
     gone (deleted in the hc ui, auto-deleted, or never landed): drop the
     row. found -> keep the row, `attempts += 1`.
   - read permission missing: `attempts += 1`; after 5 failed runs drop the
     row and log it. the worst case is one stale twilight record left in
     hc; the ledger still stops it from being rehydrated.
5. `E_HC_RATE_LIMIT`, `E_HC_PERMISSION`, `E_HC_IO`: stop, keep rows, no
   attempt counted.
6. after 3 failed attempts on a row that still exists remotely, the error
   card shows the swift `deleteFailed` copy adapted to hc.

the deletion ledger `hc_deleted_sessions(session_id, deleted_at)` is
permanent (it is small: one row per deleted owned night). it replaces the
first draft's "orphan rehydration skips outbox ids", which failed when the
outbox had already drained but an old own upsert or own record was still
visible (for example a read that ran while a delete was not yet applied,
or a write-only run that drained the outbox before the next read run).
archive import removes ledger rows for session ids it restores (6.4).

#### remote deletion of twilight records (policy)

facts: the hc ui can delete single entries, a data type, "delete app data"
for twilight, or "delete all data"; hc also has an auto-delete setting that
deletes data older than a chosen period "each day" (google support, "delete
your data from health connect"). the support page does not list the
periods; check them on the emulator (7.3 step 22). a twilight record
deleted by auto-delete is indistinguishable from one the user deleted.

the first draft deleted the local session for every remote deletion, with a
"5 or more in one sync" hold. auto-delete defeats that guard: it removes a
few old nights every day, each run stays under 5, and the local journal is
silently eaten from the oldest end. the first draft's "keep" also
re-exported the night, which auto-delete removes again the next day: a
deletion loop.

policy (applies to a `DeletionChange` for a known `hc_record_id`, and to a
full read that finds an owned session with `hc_written = 1`, not pending,
whose record is missing, within the own-read range):

1. the local session is never deleted without a user action.
2. the session gets `hc_remote_deleted = 1`, `hc_record_id = null`,
   `hc_written = 0`. outbound skips it (no re-export, so no loop).
3. if the night ended more than 30 days before the deletion was observed,
   that is all ("aged out": auto-delete or a bulk range delete). no card.
4. otherwise the session id is added to `heldRemoteDeletions`. the health
   connect screen shows one card "Health Connect removed N Twilight
   night(s)" with "Remove from Twilight" (deletes them locally, ledger rows,
   no outbox) and "Keep in Twilight" (clears the held list; the nights stay
   local with `hc_remote_deleted = 1`).
5. an explicit user edit of a `hc_remote_deleted` session clears the flag
   and exports it again (prior art used the same rule: "explicit remote
   removal pauses export until the next intentional local edit"). "Pull"
   does not re-create them.

retention exception for imports: a foreign `DeletionChange` (or vanished
import) for a night that ended more than 30 days before it was observed does
not delete the local import. the import is detached instead: links removed,
`health_import_detached = 1`. it stays in the journal and still blocks
overlapping foreign nights. a detached import that later matches a mirror
night by key re-links and updates. reason: hc auto-delete would otherwise
erase the imported sleep history that sri and trends depend on. swift
always deletes vanished imports (healthkit has no auto-delete); the
deviation is listed in 2.10. the user can still delete any night in
twilight.

### 2.7 availability states

`HealthConnectClient.getSdkStatus(context)`:

| sdk status | port state | ui |
|---|---|---|
| `SDK_AVAILABLE` | `available` | normal flow |
| `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` | `providerUpdateRequired` (new, no healthkit equivalent) | "Update Health Connect" opens `market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding` |
| `SDK_UNAVAILABLE` | `unavailable` | hidden: no onboarding step, no settings row, no dashboard pull. exception: when `healthSyncEnabled` is already true (hc was disabled or removed after connecting), the settings row stays with the "unavailable" copy so the user can turn sync off |
| ios / module missing | `unsupported` | every hc surface hidden |

`SDK_UNAVAILABLE` reference text: "apps should hide any integration points to
health connect in this case". the first draft showed an "unavailable" step
and card instead.

android 14+ ships hc as a framework module, so `providerUpdateRequired` is
expected only on android 13 and lower (apk provider). the reference only
says "the provider is either not installed or needs to be updated", so the
engine handles the state on every version and does not branch on sdk int.
the manifest declares
`<queries><package android:name="com.google.android.apps.healthdata"/></queries>`.
availability is re-read on every foreground (the user can install or update
the provider while twilight is in the background).

### 2.8 permissions and rationale

- manifest (module `AndroidManifest.xml`, merged automatically):
  `android.permission.health.READ_SLEEP`, `WRITE_SLEEP`,
  `READ_HEALTH_DATA_HISTORY`. no background read permission: swift sync is
  foreground-only and so is the port.
- request: `PermissionController.createRequestPermissionResultContract()` via
  expo `RegisterActivityContracts { registerForActivityResult(...) }`
  (fallback: `startActivityForResult` + `OnActivityResult` if the sdk 58 api
  differs). the call resolves with the granted set re-read from
  `getGrantedPermissions()`.
- hc exposes read and write status separately (healthkit hides read status).
  the port uses both: inbound runs when read is granted, outbound when write
  is granted. partial grants are a "connected" state with copy that says
  "import only" or "export only".
- `notDetermined` vs `denied`: hc cannot say "never asked". the engine stores
  `permissionRequestedAt`; no grants + never requested = `notDetermined`;
  no grants + requested = `denied`. the first draft stated "after two
  denials hc stops showing the dialog"; the pages read for this design do
  not say that, so the design does not depend on a count: whenever a request
  resolves with no grants, the state is `denied` with "Open Health Connect"
  (`HealthConnectClient.getHealthConnectManageDataIntent`). the e2e run
  records the observed behavior (7.3 step 14).
- enable result (swift `enableSync` parity): if the request resolves with
  neither read nor write, `healthSyncEnabled` stays false and the
  permission error is shown. with at least one direction, sync is enabled.
- connection from inside hc: users can connect an app from the hc app. hc
  docs: apps that do not export an onboarding activity get the "manage
  permissions" screen, "which may be acceptable for apps where permissions
  being granted is the only prerequisite". twilight does not export
  `ACTION_SHOW_ONBOARDING`; grants made in hc show as `readyToEnable`, and
  sync starts only after the user turns it on in twilight (swift parity:
  sync is an explicit user switch).
- rationale (both required): `HealthConnectRationaleActivity` handles
  `androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE` (android 13 and lower),
  and an `activity-alias` `ViewPermissionUsageActivity` with
  `android.intent.action.VIEW_PERMISSION_USAGE`, category
  `android.intent.category.HEALTH_PERMISSIONS`, permission
  `android.permission.START_VIEW_PERMISSION_USAGE` (android 14+). the
  activity is native kotlin (hc launches it in its own task; a deep link into
  the rn activity would break back navigation). it renders a scrolling,
  day/night-aware material layout: title "Twilight and Health Connect", the
  three swift permission facts adapted (reads sleep sessions to import nights;
  writes the nights you track or log in Twilight, and can update or delete
  only those; you stay in control), the read-window note, and a privacy
  policy link. copy must match the play console privacy policy. (the first
  draft said "record or edit"; edited imports are not written, 2.5.)
- android 14+ specifics summary: framework module (no install), the
  activity-alias rationale entry point, unlimited own-data reads (used for
  orphan rehydration after reinstall), permission revocation is possible
  from system settings at any time so status is re-read on every foreground.

### 2.9 dependency and sdk levels

- `androidx.health.connect:connect-client:1.1.0` (stable). it needs
  `compileSdk >= 36` and agp >= 8.9.1; this repo resolves rn 0.88 with
  `compileSdk 37`, agp `9.2.1`, `minSdk 24`.
- 1.1.0 has `minSdk 26`; 1.2.0-alpha05+ lowered it to 24 but is alpha.
  decision: stay on stable 1.1.0 and raise the app `minSdkVersion` to 26 with
  `expo-build-properties` (one separate `app.json` plugin entry). hc itself
  needs android 9, so api 24/25 users lose nothing they could use. tell the
  parallel workstream about the min sdk change in the merge notes.
- `.gitignore` uses anchored `/android` and `/ios`. verified:
  `git check-ignore -v --no-index modules/twilight-health-connect/android/build.gradle`
  prints nothing (not ignored); `android/app/build.gradle` is ignored. the
  prior-art bug (unanchored `android`) does not apply. re-run the check
  before the first native commit.

### 2.10 every hc vs healthkit difference and the chosen behavior

1. read window (30 days) vs full history -> history permission requested;
   range reads trim silently, so absence is decided from evidence and links
   (2.4).
2. changes token vs full read every sync -> mirror + token, full re-read only
   on first sync, token expiry, invalid token, force resync (2.3); one
   reconcile per pass over the mirror.
3. version must strictly increase vs replace on any write -> clock-based
   monotonic versions (3.3), remote version learning and self-heal.
4. deletion changes carry only the record id -> store `hc_record_id` and the
   mirror ids.
5. one record with stages vs many stage samples -> stage-to-kind mapping
   (no stages = asleep); the clusterer still runs because some sources
   split one night into several sessions (naps, interrupted nights).
6. per-end zone offsets vs one zone id -> write both offsets; on read map
   offsets back to zone ids (3.5).
7. separate read and write status vs write-only status -> partial states.
8. provider update required state -> new ui state and play store action;
   `SDK_UNAVAILABLE` hides every hc surface (hc guidance).
9. remote deletion of own records -> never deletes the local journal
   silently; recent ones need a user decision, aged-out ones only stop
   exporting (2.6). swift ignores them.
10. no `retryEmptyImport` 800 ms re-read. this is an assumption, not a
    documented hc guarantee: the first draft stated that "hc reads are
    consistent after the grant callback", which no page read here says. the
    e2e run checks it (7.3 step 2); if the first read after the grant is
    empty, add the same single delayed retry as swift.
11. no custom metadata -> session id from `clientRecordId`, original tag from
    recording method on rehydration.
12. rationale activity and play console declaration are mandatory on android.
13. ownership is by package only; a twilight-prefixed record from another
    package is foreign (2.2).
14. adopted (edited) imports are not written to hc (hc write-back guidance,
    no overlapping duplicates); swift exports them (2.5).
15. imports whose night ended more than 30 days ago are detached instead of
    deleted when their records disappear (hc auto-delete) (2.6).
16. inbound runs only in the foreground (hc read rule); a sync requested in
    the background runs outbound only (4.3).
17. force resync repairs differences instead of rewriting every record
    (2.5).
18. device restore from android auto backup resets device-bound sync state
    (4.6).

---

## 3. data model and migration

### 3.1 current schema

`sleep_sessions(id, tag, start_time, end_time, start_tz, end_tz, created_at,
updated_at)` via `create table if not exists`; no schema version. settings in
`expo-sqlite/kv-store` (a different store, so not transactional with
`twilight.db`).

### 3.2 migration v2 (`PRAGMA user_version`)

`migrate(db)` becomes a versioned runner: `user_version 0` = run the existing
create statements (idempotent), then step to 1; step 2 applies:

```sql
alter table sleep_sessions add column is_health_imported integer not null default 0;
alter table sleep_sessions add column health_adopted integer not null default 0;   -- edited import: owned locally, never written to hc
alter table sleep_sessions add column health_import_detached integer not null default 0; -- import kept after its records aged out (2.6)
alter table sleep_sessions add column health_provider text;            -- 'health_connect' | 'healthkit' | null
alter table sleep_sessions add column health_night_key text;
alter table sleep_sessions add column health_source_id text;           -- data origin package / bundle id
alter table sleep_sessions add column needs_health_sync integer not null default 1;
alter table sleep_sessions add column health_sync_version integer not null default 2;  -- clock-based, 3.3
alter table sleep_sessions add column hc_record_id text;               -- own record id in hc
alter table sleep_sessions add column hc_remote_version integer;       -- last clientRecordVersion seen in hc
alter table sleep_sessions add column hc_written integer not null default 0;       -- write-ahead: a twilight record may exist (2.5)
alter table sleep_sessions add column hc_remote_deleted integer not null default 0; -- removed in hc; export paused until an edit (2.6)
alter table sleep_sessions add column hc_error_code text;              -- 'invalid' poison marker (2.5)
alter table sleep_sessions add column hc_error_version integer;        -- version the marker applies to

create table if not exists health_tombstones (
  night_key text primary key not null,
  deleted_at integer not null,
  record_ids text not null default '[]'                                -- json array of hc record ids, excluded from clustering
);
create table if not exists hc_deleted_sessions (                       -- permanent ledger of locally deleted owned ids (2.6)
  session_id text primary key not null,
  deleted_at integer not null
);
create table if not exists hc_records (                                -- foreign mirror only
  record_id text primary key not null,
  data_origin text not null,
  client_record_id text,
  start_time integer not null,
  end_time integer not null,
  start_offset integer,
  end_offset integer,
  last_modified integer not null,
  stages text not null default '[]'
);
create table if not exists hc_import_links (                           -- swift importedSampleUUIDs
  session_id text not null,
  record_id text not null,
  primary key (session_id, record_id)
);
create table if not exists hc_pending_deletions (                      -- remote delete outbox (2.6)
  client_record_id text primary key not null,
  session_id text not null,
  hc_record_id text,
  start_ms integer not null,
  end_ms integer not null,
  attempts integer not null default 0,
  last_error text,
  created_at integer not null
);
create table if not exists health_sync_state (key text primary key not null, value text not null);
create index if not exists idx_sessions_hc_record on sleep_sessions(hc_record_id);
create index if not exists idx_links_record on hc_import_links(record_id);
```

`health_sync_state` keys: `installId` (4.6), `changesToken`,
`firstGrantedAt` (copy only), `permissionRequestedAt`, `lastFullReadAt`,
`lastSuccessAt`, `lastError` (json `{code, message, at}`), `lastPullResult`
(json, swift shape), `heldRemoteDeletions` (json session ids),
`payloadRevision` (3.3). they live in `twilight.db` so the token commits in
the same transaction as mirror changes. (`coverageStart` from the first
draft is removed, 2.4.)

`healthSyncEnabled` goes to `SettingsStore` (kv) with a validator and default
`false` (swift parity: UserDefaults bool).

existing rows get `needs_health_sync = 1` and `health_sync_version = <ms
time of the migration>` (not 2, so a record left in hc by an earlier
install cannot silently win, 3.3): the first enable exports the existing
journal, as swift does. demo rows are excluded by rule (4.4). new rows use
the clock rule at creation.

`SqlDatabase` gains `withTransactionSync(fn)` (expo-sqlite has it; the
`node:sqlite` test helper wraps `BEGIN`/`COMMIT`/`ROLLBACK`).

### 3.3 version rule (fixes swift defect 1)

- every mutation of an owned (not adopted), ended session
  (`endActiveSession`, `updateSession`, archive overwrite, a force-resync
  repair, a payload revision change) sets `needs_health_sync = 1` and
  `health_sync_version = max(health_sync_version + 1, Date.now())`. swift
  bumps only when not already pending; the port always bumps. a user edit
  also clears `hc_remote_deleted` and the `hc_error_*` marker.
- why clock-based (the first draft used `+1` and
  `writeVersion = max(local, (hc_remote_version ?? 0) + 1)`): hc ignores a
  lower or equal version SILENTLY (2.5), and `hc_remote_version` is only
  known after a read. with write-only permission there is no read; after a
  reinstall, `pm clear`, or archive restore the counter restarts at 2 while
  hc still holds version 5 from the old install. every later edit would be
  dropped by hc with no error, and the session would be marked synced. a
  millisecond clock value at mutation time is above any version an earlier
  install wrote (that install also used the clock), so correctness no
  longer depends on reading first. the `+1` term keeps versions strictly
  increasing if the clock goes backwards. values stay below 2^53, so they
  are exact in js numbers and kotlin `Long`.
- self-heal when read is granted: if an own record (from a change or a full
  read) shows `clientRecordVersion > health_sync_version`, or the same
  version with different start, end or offsets, the engine sets
  `health_sync_version = remote + 1` (then the clock rule), pending. this
  covers a device clock that was wrong when an earlier write happened.
- `hc_remote_version = max(hc_remote_version, observed)`; a replayed older
  own change never lowers it.
- mark synced is compare-and-set:
  `update ... set needs_health_sync = 0, hc_record_id = ?, hc_remote_version = ?
  where id = ? and health_sync_version = ?`. an edit during the write changes
  the version, the update matches zero rows, and the session stays pending.
- crash between write and mark: the session is still pending with the same
  version; the next write sends the same version, hc ignores it (same
  content), and the mark succeeds. idempotent.
- payload migration: `HEALTH_PAYLOAD_MIN_VERSION = 2` keeps swift's floor;
  `payloadRevision` in sync state is compared with a code constant, and a
  change marks every owned, ended, valid, not adopted, not remote-deleted
  session pending with the clock rule (swift
  `prepareForCurrentHealthKitPayload`).

### 3.4 repository changes (`src/data/session-repo.ts`)

- `SleepSession` gains `health: { imported, provider, nightKey, sourceId,
  needsSync, syncVersion, hcRecordId, hcRemoteVersion }`. ui code keeps using
  the existing fields.
- `updateSession` (editor): adopt if imported (`is_health_imported = 0`,
  `health_adopted = 1`, keep night key and links), else bump version (3.3)
  and set pending. "user edits win": an adopted session is owned for the
  reconciler, so later source updates hit `skipAdopted` /
  `skipOverlapsTwilightOwned` (4.2). adopted sessions are never written.
- `deleteSession(id)` -> one transaction: tombstone if `health_night_key`
  (key + linked record ids + overlapping other-source mirror record ids,
  2.6), delete links; for an owned, not adopted, not demo session: insert a
  ledger row, and enqueue `twilight.sleep-session.<id>` in the outbox when
  `hc_written = 1` and the repo was built with `recordRemoteDeletions = true`
  (android); then delete the row.
- `deleteSessionsWithPrefix` / `replaceSessionsWithPrefix` (demo seed and
  demo exit) never write ledger, outbox or tombstone rows. demo ids are never
  written to hc, so there is nothing to delete remotely.
- `createManualLog` / `startSession`: defaults (pending, clock version).
- new `HealthStore` (`src/data/health-store.ts`): all sql for mirror, links,
  tombstones, outbox, sync state, and `applyInboundPlan(plan)` /
  `markSynced(...)` as single transactions.

### 3.5 time zones

- export: kotlin computes offsets from the iana ids at the exact instants.
  invalid or missing zone -> the session is not written and the engine
  reports the swift `missingTrackedTimeZone` copy adapted to hc. the core
  validates zones with `Intl.DateTimeFormat` before planning.
- import: `zoneForOffset(offsetSec, instant, deviceZone)` picks the first
  candidate whose offset AT THAT INSTANT equals `offsetSec`: (1) the device
  zone; (2) for whole-hour offsets, `Etc/GMT∓h` (posix sign inversion:
  `+02:00` is `Etc/GMT-2`); (3) for non-whole-hour offsets a fixed table of
  representative iana zones: `+03:30 Asia/Tehran`, `+04:30 Asia/Kabul`,
  `+05:30 Asia/Kolkata`, `+05:45 Asia/Kathmandu`, `+06:30 Asia/Yangon`,
  `+08:45 Australia/Eucla`, `+09:30 Australia/Darwin`, `+10:30
  Australia/Adelaide` (summer), `-03:30 America/St_Johns` (winter), `-02:30
  America/St_Johns` (summer), `-09:30 Pacific/Marquesas`, `+12:45
  Pacific/Chatham` (winter), `+13:45 Pacific/Chatham` (summer); (4) the
  device zone. every candidate is validated with `Intl.DateTimeFormat` at
  runtime and is used only if its offset at that instant matches. the first
  draft fell back to the device zone for every half-hour offset, so a night
  recorded in india and read on a phone set to paris got paris local times
  and could land on the wrong calendar day. null offset -> device zone
  (swift fallback is `TimeZone.current`). start and end map independently.
  hermes `Intl` support for `Etc/GMT*` and the table zones is checked on the
  emulator (7.3 step 16).
- hc night key wake day = local date of the end instant shifted by the end
  offset (falls back to the device zone when the offset is null). the key no
  longer changes when the device travels (swift defect 3).

---

## 4. sync engine

### 4.1 boundaries

```
src/domain/health/         pure ts, no react/expo imports (repo rule for src/domain)
  types.ts                 record, sample, night, local snapshot, action types
  ownership.ts             clientRecordId <-> session id, isTwilightAuthored
  clusterer.ts             swift clusterer port + record-to-sample mapping
  reconciler.ts            swift reconciler port + record-id matching
  inbound.ts               planInbound(mirror, locals, tombstones, links, window) -> plan
  changes.ts               planChangesPage(page, own package, state) -> mirror ops + own learning + owned deletions
  outbound.ts              planOutbound(sessions, outbox, status) -> writes, deletes, errors
  zones.ts                 zoneForOffset, wakeDayKey
  pull-result.ts           messages (swift parity, hc wording)
  connection-state.ts      ui state machine + copy tables
src/data/health-store.ts   sql (mirror, links, tombstones, outbox, sync state, transactional apply)
src/services/health-connect/
  adapter.ts               HealthConnectAdapter interface + error codes
  native-adapter.ts        requireOptionalNativeModule('TwilightHealthConnect'); null on ios
  sync-engine.ts           orchestration, single-flight, exclusive lock
  health-connect-state.ts  zustand status store (status, connection state, syncing, last error/pull)
  use-health-connect-sync.ts  foreground + launch triggers
modules/twilight-health-connect/   thin kotlin module (no sync logic)
```

the adapter is the only seam to hc. tests inject `FakeHealthConnect`
(in-memory, implements version-ignore semantics, changes log with
`hasMore` paging, token expiry switch, per-origin records, permission flags).

```ts
export type HcAvailability = 'available' | 'providerUpdateRequired' | 'unavailable';
export interface HcStatus {
  availability: HcAvailability;
  read: boolean;
  write: boolean;
  history: boolean;
  historyFeatureAvailable: boolean;
  packageName: string;
  sdkInt: number;
}
export interface HcStage { startMs: number; endMs: number; type: number }
export interface HcSleepRecord {
  recordId: string;
  dataOrigin: string;
  clientRecordId: string | null;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
  lastModifiedMs: number;
  recordingMethod: 'manualEntry' | 'activelyRecorded' | 'automaticallyRecorded' | 'unknown';
  stages: HcStage[];
}
export interface HcChangesPage {
  upserts: HcSleepRecord[];
  deletedRecordIds: string[];
  nextToken: string;
  hasMore: boolean;
  tokenExpired: boolean;
}
export interface HcWrite {
  clientRecordId: string;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startZoneId: string;
  endZoneId: string;
  recordingMethod: 'manualEntry' | 'activelyRecorded';
}
export type HcWriteResult = { ok: true; recordId: string } | { ok: false; code: HcErrorCode; message: string };
export type HcErrorCode =
  | 'E_HC_UNAVAILABLE' | 'E_HC_PERMISSION' | 'E_HC_RATE_LIMIT'
  | 'E_HC_TOKEN' | 'E_HC_INVALID' | 'E_HC_REMOTE' | 'E_HC_IO';
export interface HealthConnectAdapter {
  getStatus(): Promise<HcStatus>;
  getInstallId(): Promise<string>;   // uuid in getNoBackupFilesDir(), 4.6
  requestPermissions(options: { history: boolean }): Promise<HcStatus>;
  openPermissionSettings(): Promise<void>;
  openProviderInstall(): Promise<void>;
  getChangesToken(): Promise<string>;
  getChanges(token: string): Promise<HcChangesPage>;
  // range read; also used by the outbox verify step (2.6) with a narrow window
  readSleep(query: { origin: 'own' | 'all'; startMs: number | null; endMs: number; pageToken: string | null }):
    Promise<{ records: HcSleepRecord[]; nextPageToken: string | null }>;
  upsertSleep(writes: HcWrite[]): Promise<HcWriteResult[]>;
  deleteSleepByClientRecordIds(ids: string[]): Promise<void>;
}
```

kotlin module (`modules/twilight-health-connect`, android only,
`expo-module.config.json` `platforms: ["android"]`): one function per adapter
method, `AsyncFunction ... Coroutine`, records serialized as above, kotlin
exceptions mapped to the error codes (`SecurityException` -> permission,
`IllegalStateException` with quota text -> rate limit (the read-data sample
catches quota errors as `IllegalStateException`; other
`IllegalStateException` -> unavailable, which the reference also uses for
"service isn't available"), `RemoteException` -> remote (also "deleting by
invalid identifiers"), `IOException` -> io, `IllegalArgumentException` ->
invalid, token errors -> token). the raw exception class and message are
kept in `lastError` details for logcat. defensive guard: `upsertSleep` and delete reject any
`clientRecordId` without the twilight prefix. `index.ts` exports the typed
native module.

### 4.2 engine algorithm

`sync(kind)` with `kind = 'full' | 'push' | 'forceResync'`:

```
guard: platform android, adapter present, settings.healthSyncEnabled,
       !settings.isDemoDataActive                      -> else skip result (swift messages)
install check (4.6): installId mismatch -> device-restore reset first
status = adapter.getStatus(); store status; record firstGrantedAt (copy only)
availability != available                              -> lastError unavailable / update required
!read && !write                                        -> lastError permission
foreground = AppState.currentState === 'active'
runExclusive:
  0. payload revision check (sql, 3.3)
  1. inbound (read granted, foreground, kind != 'push' or no full read yet):
     forceResync: clear token + mirror (keep tombstones, links, ledger)
     no token -> fullRead:
        token = getChangesToken()                               BEFORE the reads
        own   = readSleep(own, epoch..now)                      paged
        all   = readSleep(all, epoch..now)                      paged, own rows dropped
        tx: replace the whole mirror with foreign(all)
            learn own ids/versions (max, self-heal 3.3)
            own records missing for hc_written=1 synced sessions -> remote-deletion policy (2.6)
            rehydrate orphans: own records whose session id is not local and
              not in the ledger
            forceResync only: mark repairs pending (2.5)
            save token, lastFullReadAt
     else loop getChanges(token):
        tokenExpired, or invalid token (2.3) -> clear token, goto fullRead (once per run)
        tx per page: mirror upserts/deletes (foreign only), own learning,
            own deletions -> remote-deletion policy (2.6); save nextToken
     tx reconcile (always, once): planInbound(mirror, locals, tombstones,
            links, ledger, evidence) -> inserts, updates, merges, vanished,
            detaches, superseded imports
  2. outbound (write granted; background allowed, 4.3):
     drain outbox (2.6 rules)
     planOutbound -> writes for owned, not adopted, not remote-deleted,
                     ended, valid, non-demo, pending, valid zone, and not
                     poisoned at this version
                  -> outbox rows for written sessions that became invalid
     per batch: tx set hc_written = 1 -> upsert -> per result tx
                compare-and-set markSynced
  3. lastSuccessAt; lastPullResult (inbound runs only); lastError only for real errors
```

order inbound-then-outbound is swift parity. `push` (after a local change)
skips inbound unless no full read ever happened (and then only in the
foreground).

reconcile (`planInbound`), per night, sorted by start ascending, first
match wins. changes against the swift order are marked "new":

0. new: records whose id is in any tombstone's `record_ids` are removed from
   the mirror snapshot BEFORE clustering. the first draft skipped a whole
   cluster that contained a tombstoned record; when a source app later
   merged the deleted night with a new night within 3 h, the new night was
   blocked too.
1. `skipTombstoned` if the night key is tombstoned (swift; also covers
   archive tombstones that have no record ids).
2. `updateImported(sessionID, night)`: the imported (not adopted) session
   that shares the most record ids with the night (links), ties -> earliest
   start; else an imported session with the same night key (swift rule;
   also re-links a detached import). the first draft did not say what
   happens when one night shares records with two imports (a source merges
   a nap into the night): the import with the most shared records is
   updated, the other import, whose records are now all inside this night,
   is removed as `mergedInto` (no tombstone). a split goes the other way:
   the import follows the part holding most of its records; the other part
   is a normal candidate for insert.
3. new: `skipAdopted` if an adopted session has the same night key or
   shares any record id (fixes swift defect 7).
4. `skipOverlapsTwilightOwned` if any owned session overlaps (adopted
   counts as owned).
5. `skipOverlapsImported` if any imported session overlaps.
6. `insert(night)`; in-batch overlap -> `skipOverlapsImported` (swift).

after the night loop:

- vanished: imported sessions whose links are all absent from the mirror.
  in a changes pass the mirror is exact, so they are deleted, except the
  retention exception (ended more than 30 days ago -> detach, 2.6). in a
  full read the evidence rule of 2.4 also applies. vanished sessions are
  computed BEFORE the night loop and excluded from the overlap checks, so a
  night from a second source that the vanished import used to block is
  inserted in the same pass (swift needs a second pull for that).
- superseded: an imported (not adopted) session that overlaps an owned
  session (after the updates above) is removed without a tombstone (fixes
  swift defect 9). this happens when the user logs or edits a night that is
  already imported, or when a source app grows its night into a twilight
  night. "user edits win" either way. if the user later deletes the owned
  session, the night is imported again on the next pass. the active
  session counts as owned with an open end (swift overlap rule).

### 4.3 concurrency

- single-flight: one promise. a request during a run records the highest
  pending kind (`forceResync > full > push`) and runs once more after the
  current run. no busy wait (swift polls every 50 ms).
- background: a session can end while the app is not active (the parallel
  workstream's notification "Wake Up" action, or a headless task). reads
  are foreground-only (2.3); writes are not documented as foreground-only,
  but background rate limits are stricter (rate-limiting guide). rule: a
  run requested while not active does outbound only, at most one batch;
  everything else waits for the next foreground trigger. pending state is
  persistent, so nothing is lost. if the js runtime is not alive at all,
  the next launch syncs.
- permission revoked mid-run: every adapter call can throw
  `E_HC_PERMISSION`. the engine re-reads `getGrantedPermissions()`; read
  revoked -> abort inbound without committing the current page or full
  read (token unchanged); write revoked -> stop outbound (pending stays,
  `hc_written` may be 1 for a batch that never landed, which only causes a
  harmless outbox verify later, 2.6).
- `runExclusive(fn)`: archive import and demo import/exit wait for the
  current run, block new runs while `fn` runs, then request `full`.
- local mutations are synchronous sqlite writes on the js thread. the engine
  never holds rows in memory across an await without the compare-and-set
  guard; plans are recomputed from the database inside each transaction.
- the zustand status store is the single ui source; `isSyncing` is true only
  while a run with inbound work runs (swift `isSyncingHistory`).

### 4.4 demo isolation

- swift blocks all sync while the demo profile is current. port: no sync
  while `isDemoDataActive` (full, push and force return the swift-adapted
  skip message "Demo data does not sync with Health Connect.").
- defense in depth: `planOutbound` never emits ids with
  `DEMO_SESSION_ID_PREFIX` (`rami-demo-session-`) or `tag == 'Demo Log'`;
  the kotlin guard only accepts the twilight prefix; repo never enqueues
  outbox, ledger or tombstone rows for demo ids (including the bulk
  `deleteSessionsWithPrefix` on demo exit); inbound never creates
  demo-prefixed ids; orphan rehydration ignores demo-prefixed session ids;
  the overlap checks of reconcile ignore demo sessions (a demo night must
  never block or supersede a real import, and reconcile does not run while
  demo is active anyway).
- demo start and demo exit run inside `runExclusive`, so a sync in flight
  finishes before demo rows appear or disappear.
- real sessions logged during demo stay pending and export after exit.
- `EXPO_PUBLIC_DEMO_MODE=1` builds seed demo on every launch and keep
  `isDemoDataActive` true, so they never talk to hc.
- archives: the data section is hidden while demo is active (swift parity);
  the exporter also drops demo-prefixed ids; the importer refuses while demo
  is active and drops demo-prefixed ids from files.

### 4.5 invariants and how they hold

| invariant | mechanism | test |
|---|---|---|
| no duplicate nights locally | reconciler overlap skips + in-batch skip; record-id and key matching for updates; merge/split rule; `skipAdopted`; superseded imports removed; one reconcile per pass so delete + re-insert keeps the session id; mirror keyed by record id | reconciler batch, merge, split, adopted, superseded tests; engine "full read twice" and "delete + reinsert across pages" tests |
| no echo import | own = own package, filtered before clustering; own changes never imported | clusterer "ignores own package", "prefixed foreign record is foreign", engine export-then-pull test |
| no duplicate twilight records in hc | stable `clientRecordId` upsert; adopted imports never written; ownership by package so twilight never re-exports another package's record | fake-hc engine test: edit 3 times -> 1 record; adopted edit -> 0 writes |
| no silently dropped write | clock-based versions; compare-and-set mark; self-heal from remote version; poison marker only per version | reinstall test with remote version 5 and write-only permission; clock-backwards test |
| user edits win | adoption on edit; owned overlap beats foreign; superseded imports; versions only go up | adopt test, foreign update after adopt test, manual log over import test |
| deletions propagate both ways | outbox gated by `hc_written`, delete verify, ledger (local -> hc); tombstones incl. other-source records (imports); `DeletionChange` (hc -> local) for foreign records | outbox, poison-free outbox, ledger, tombstone, other-source tests |
| no silent loss of the journal | remote deletion of own records never deletes locally without a user action; aged-out imports detach; absence needs links + evidence; device-restore reset | remote-delete policy, auto-delete simulation, restore tests |
| no deletion loop | remote-deleted sessions are not re-exported until a user edit; "Pull" repairs but does not re-create them | keep-then-autodelete test |
| no resurrection | ledger checked by orphan rehydration; rehydration only from full own reads | delete while disabled, delete then replayed own upsert, write-only drain then read tests |
| nothing lost on crash mid-sync | page + token in one transaction; reconcile from the committed mirror on every pass; outbox and ledger persisted with the row delete; write-ahead `hc_written`; compare-and-set mark; re-run is idempotent | engine tests that throw between every pair of steps and re-run |
| demo never exported | 4.4 | demo tests on planner and engine, demo exit bulk delete test |
| exactly one active session | archive import skips incoming active when one exists; inbound only creates ended sessions | archive merge test |

### 4.6 device restore (android auto backup)

fact: expo's config plugin writes `android:allowBackup` from
`android.allowBackup ?? true` (`@expo/config-plugins` `AllowBackup.js`), and
this app does not set it, so android auto backup can restore `twilight.db`
onto a new device or after a reinstall. the restored database then carries
device-bound hc state from another hc store: a changes token, mirror rows
and links with record ids that do not exist here, `hc_record_id` values,
`hc_written` flags, `firstGrantedAt`. the first draft did not consider this.
effects without a fix: stale links make the absence rule delete imports;
owned sessions marked synced are never exported to the new hc store; stale
outbox rows fail.

fix:

- the native module returns an `installId`: a random uuid stored in a file
  under `Context.getNoBackupFilesDir()` (excluded from auto backup by the
  platform), created on first call.
- `health_sync_state.installId` holds the value the database was synced
  with. on mismatch (restore, or first run after this migration) the engine
  runs, in one transaction: clear token, mirror, links, `firstGrantedAt`,
  `heldRemoteDeletions`; set `hc_record_id = null`, `hc_remote_version =
  null`, `hc_written = 0`, `hc_remote_deleted = 0` on every session; mark
  every owned, ended, valid, not adopted session pending with the clock
  rule; keep outbox rows but reset `attempts` (their client record ids are
  stable across devices, and the verify step drops rows whose record is
  absent); keep the ledger and tombstones (user decisions); mark imports
  detached (they have no links in this store); store the new `installId`.
- the next sync is a full read; owned sessions are upserted by stable
  client record id, so if hc's own backup also restored the records, the
  upsert replaces them (clock version is higher) instead of duplicating.

### 4.7 disable and re-enable

swift `disableSync` sets enabled false and clears the anchor and the sample
uuid map. the first draft did not define disable for the port.

- disable: `healthSyncEnabled = false`; clear token and mirror (a token
  would expire unused after 30 days anyway, and the mirror would go stale);
  keep links, tombstones, ledger, outbox, imports and all session flags.
  no hc call is made.
- while disabled: local edits keep marking sessions pending; local
  deletions keep writing ledger and outbox rows (this is what fixes swift
  defect 2).
- re-enable: full read, then outbound drains the outbox and exports pending
  sessions.
- disable does NOT delete twilight records from hc and does not revoke hc
  permissions (swift parity; the settings tip says permissions are managed
  in health connect).

---

## 5. ui surfaces

all hc ui renders only when `Platform.OS === 'android'` and the native
module exists. icons use sf names through `NativeSymbol` with new material
mappings in `native-symbol-map`. copy replaces "Apple Health" with
"Health Connect"; "Open Settings" becomes "Open Health Connect".

### 5.1 connection state (pure, `connection-state.ts`)

inputs: availability, read, write, permissionRequested, enabled, demoActive.

| state | condition |
|---|---|
| `demo` | demo active |
| `hidden` | availability unavailable and sync not enabled (no hc surface renders, 2.7) |
| `unavailable` | availability unavailable and sync enabled (settings row only) |
| `updateRequired` | provider update required |
| `connected` | enabled and (read or write); sub-flag `importOnly` / `exportOnly` |
| `readyToEnable` | not enabled and (read or write) |
| `notDetermined` | no grants, never requested |
| `denied` | no grants, requested |

### 5.2 onboarding step (android only)

- route `src/app/onboarding/health-connect.tsx`, order on android: welcome ->
  health connect -> schedule -> notifications -> sample data (swift order:
  feature overview -> apple health -> schedule ...). welcome "Get Started"
  pushes `health-connect` on android when the state is not `hidden`, and
  `schedule` on ios or when `hidden` (one-line change plus a status read).
- port of `AppleHealthOnboardingStepView`: icon hero, title, subtitle,
  benefits card, status note, primary + secondary actions, refresh status on
  foreground.
- copy: connected "Health Connect connected" / connecting "Importing your
  Health Connect sleep history into Twilight..." / idle "Your Health Connect
  sleep history is in Twilight. Twilight can import more nights and save the
  ones you log here back to Health Connect."; notDetermined and readyToEnable
  "Sync with Health Connect", "Import your Health Connect sleep history now,
  and save nights you log in Twilight back to Health Connect. Continue to
  review the Health Connect permission request."; denied "Health Connect needs
  permission", "Access is off for Twilight. Enable it in Health Connect or
  continue without it."; unavailable "Health Connect isn't available here",
  "Twilight still works normally without Health Connect syncing.";
  updateRequired "Update Health Connect", "Install the latest Health Connect
  from Google Play to sync sleep, or continue without it." benefits: "Import
  existing Health Connect sleep history", "Save Twilight nights back to Health
  Connect", "Only sleep data, and you can change this later". status note:
  "Twilight only uses sleep session data for this sync."
- buttons: notDetermined "Continue" (requests), readyToEnable "Turn on Health
  Connect sync", connecting "Importing sleep...", denied "Open Health
  Connect", updateRequired "Update Health Connect", connected/unavailable
  "Continue"; secondary "Continue without Health Connect" for readyToEnable,
  denied, updateRequired.
- connect = `enableSync()` (request, enable, `sync('full')`) then advance.
  finish (sample-data step skip or explore) awaits `sync('full')` before
  `isOnboarded = true` when enabled (swift `importIfNeeded`). explore loads
  demo, which pauses sync.

### 5.3 settings

- section component `src/components/settings/HealthConnectSection.tsx`: one
  import and one element in `settings.tsx`, rendered on android only. row:
  title "Health Connect", status label (Connected / Available / Permission
  denied / Not connected / Unavailable / Update required / Demo only), summary
  (swift summaries adapted), chevron, pushes `/health-connect`.
- screen `src/app/health-connect.tsx` (no `_layout.tsx` edit; the stack
  default `headerShown: false` applies): port of `AppleHealthSettingsView`
  cards: hero (title, subtitle, status badge, "Your sleep logs stay in
  Twilight whether or not you connect Health Connect. This screen only
  controls syncing for completed nights."), benefits ("Why connect it"),
  permissions ("What Twilight can access": "Reads sleep sessions from Health
  Connect", "Writes the nights you track or log in Twilight", "You stay in
  control"), status card with summary and tips, held-deletion card (2.6:
  title "Health Connect removed N Twilight night(s)", body "These nights
  were deleted in Health Connect. Twilight still has them and will not
  send them back unless you edit them.", actions "Keep in Twilight"
  (tonal) and "Remove from Twilight" (text, destructive color, below the
  primary emphasis)),
  error card "Something needs attention" (real errors only), last pull result
  line (informational, swift defect 4), last synced time; demo card when
  demo. action area: primary (connected "Pull from Health Connect" / "Pulling
  Health Connect sleep..."; readyToEnable "Turn on Health Connect sync";
  notDetermined "Connect Health Connect"; denied "Open Health Connect";
  updateRequired "Update Health Connect"), secondary "Turn off Health Connect
  sync" when connected, tertiary text link "Manage permissions" when
  connected (opens hc permissions). material: filled primary button,
  tonal secondary, existing card components with android elevation.
- connected tip adapted: "Sync runs when you open the app, finish a night,
  or tap Pull. It is not a live background mirror of Health Connect."
- read-window tip when history permission is missing: "Health Connect shares
  sleep from other apps back to 30 days before you connected. Allow past data
  access in Health Connect to import older nights."
- partial tips: import only "Twilight can read sleep but cannot save nights.
  Allow write access in Health Connect to export your nights."; export only
  the mirror sentence for read.
- adopted tip (shown once an imported night was edited): "Edits to nights
  imported from other apps stay in Twilight. Health Connect keeps the
  other app's original."
- the screen and the row render only when the connection state is not
  `hidden` (2.7).

### 5.4 dashboard empty state

the week card empty state in `src/app/(tabs)/index.tsx` becomes one
`<WeekEmptyState />` element (`src/components/dashboard/WeekEmptyState.tsx`).
when `canPull` (android, enabled, read granted, not demo): title "No Health
Connect sleep yet", subtitle "Pull your existing nights from Health Connect,
or log tonight in Twilight.", button "Pull from Health Connect" with a
loading state; runs `sync('forceResync')`, then refreshes the sleep store and
shows an alert titled "Health Connect" with `lastPullResult.message` or
"Twilight finished pulling from Health Connect.". otherwise the current copy.

### 5.5 status and error copy (hc)

| code | copy |
|---|---|
| unavailable | "Health Connect is unavailable on this device." |
| updateRequired | "Health Connect needs an update before Twilight can sync sleep." |
| permission | "Twilight needs Health Connect permission to sync sleep sessions." |
| invalidInterval | "This sleep session has an invalid sleep/wake interval." |
| missingZone | "This sleep log is missing the time zone it was recorded in. Edit and save the log before syncing it to Health Connect." |
| saveFailed / invalid | "Health Connect rejected this sleep session." |
| deleteFailed | "Twilight couldn't remove the matching Health Connect sleep entry." |
| rateLimit | "Health Connect is busy. Twilight will try again the next time you open the app." |
| remote / io | "Twilight couldn't reach Health Connect. Try again in a moment." |
| skip: off | "Health Connect sync is turned off." |
| skip: permission | "Twilight does not have Health Connect permission." |
| skip: demo | "Demo data does not sync with Health Connect." |
| pull: empty | "Health Connect returned no sleep from other apps. If your sleep app writes to Health Connect, check that it may write sleep and that Twilight may read sleep." (+ read-window sentence when history is missing) |
| pull: nothing new | "Found N Health Connect sleep session(s) in M night(s), but Twilight already has matching nights or they overlapped local sleep." |
| pull: imported | "Imported N night(s) from Health Connect (K session(s))." (N = inserted + rehydrated, N > 0) |
| pull: updated only | "Updated U night(s) from Health Connect (K session(s))." (fixes swift defect 5, which says "Imported 0 night(s)") |

swift `HealthKitSleepPullResult` fields are kept: sampleCount (hc
sessions), nightCount, insertedCount, rehydratedCount, message; plus
updatedCount.

### 5.6 other touches

- imported sessions use `tag = "Health Connect"` (swift "Apple Health").
- rehydrated orphans take the tag from recording method: manual entry ->
  "Manual Log", else "Sleep Mode" (swift always "Manual Log").
- metrics guide sri copy: on android restore "including imported Health
  Connect sleep" (swift "...Apple Health sleep envelopes").

---

## 6. archive (both platforms)

### 6.1 format

json, pretty printed, sorted keys, iso 8601 dates (ms). own archive type
because swift archives embed `FamilyActivitySelection` profiles that this
port cannot produce: a port file must never half-import into swift.

```json
{
  "metadata": {
    "archiveType": "twilight-expo-backup",
    "schemaVersion": 1,
    "exportedAt": "2026-11-08T07:12:00.000Z",
    "timeZoneIdentifier": "Europe/Paris",
    "appVersion": "1.0.0",
    "platform": "android"
  },
  "sleepSettings": {
    "isOnboarded": true,
    "optimalSleepMinutes": 1380,
    "optimalWakeMinutes": 420,
    "windDownReminderEnabled": true,
    "healthSyncEnabled": true
  },
  "appearance": { "themeMode": "dark", "colorPalette": "twilight" },
  "sessions": [
    {
      "id": "...", "tag": "Manual Log",
      "startTime": "...", "endTime": "...",
      "startTimeZoneIdentifier": "Europe/Paris", "endTimeZoneIdentifier": "Europe/Paris",
      "createdAt": "...", "updatedAt": "...",
      "needsHealthSync": false, "healthSyncVersion": 3,
      "isHealthImported": false, "isHealthAdopted": false, "healthProvider": null,
      "healthExternalNightKey": null, "healthSourceIdentifier": null
    }
  ],
  "healthSleepTombstones": [{ "nightKey": "...", "deletedAt": "...", "recordIds": [] }]
}
```

not archived: hc token, mirror, links, outbox, deletion ledger, record ids,
`hc_written`, `hc_remote_deleted`, error markers, `installId`, permission
state (device-bound; swift also omits anchor and uuid map).
`isHealthAdopted` is archived because it is a property of the night (an
edited import), not of the device; a missing key decodes as `false`. in
swift archives an adopted night is `isHealthKitImported = false` with a
non-null `healthKitExternalNightKey`; the swift importer path (6.3) sets
`isHealthAdopted = true` and `healthProvider = "healthkit"` for such
sessions, so they are never exported to hc.

### 6.2 versioning and validation

- `currentSchemaVersion = 1`, `minimumSupportedSchemaVersion = 1`. additive
  optional fields do not bump; missing optional keys decode to defaults
  (swift parity: missing tombstones -> `[]`). semantic changes bump.
- validation (swift): archive type, schema range, duplicate session ids.
  port additions: `endTime > startTime`, at most one active session, valid
  iana zones, minutes 0..1439, enum values.
- errors (swift copy adapted): "This file is not a Twilight backup.", "This
  backup uses schema version N, which this app version cannot import.", "The
  backup contains duplicate session IDs (id).", "The selected file could not
  be read.", plus "This backup contains an invalid sleep session (id)."

### 6.3 swift archive import (read-only migration path)

the importer also accepts swift `twilight-full-backup` schema 1..2: sessions
of `sleepSettings.sleepProfileId` (all sessions when null), break fields
ignored, swift theme raw values mapped (`System`/`Sunset`/`Night Sky` ->
`system`/`light`/`dark`, `Twilight`/`Amethyst` -> lower case),
`isHealthKitImported` -> `isHealthImported` with `healthProvider: "healthkit"`,
`needsHealthKitSync`/`healthKitSyncVersion` -> owned sync fields, tombstones
copied. healthkit imports are read-only local nights: never exported, never
touched by hc reconcile, but they count as imported for overlap checks.
the port never writes swift archives.

### 6.4 import merge rules (swift parity unless noted)

1. decode, validate, preview; confirmation alert lists: exported date, app
   version, "This import merges with your current data and does not delete
   local records.", "Sessions: T total, N new, U updated.", settings changes,
   appearance changes, active-session conflict line, "A full backup of your
   current data will be created automatically before import."
2. automatic pre-import backup: `<documents>/DataBackups/twilight_pre_import_backup_<yyyyMMdd_HHmmss utc>.json`;
   keep the newest 10 (swift keeps all).
3. inside `runExclusive` and one sqlite transaction: upsert sessions by id
   (archive record overwrites; local-only sessions stay); for owned (not
   adopted) ended sessions that are new or changed: pending + clock version
   (3.3) (deviation: swift copies `needsHealthKitSync` and the version from
   the file, which on hc would let a record from a newer install silently
   win); union tombstones (existing keys win, record ids merged); drop
   demo-prefixed ids; remove ledger rows for every restored session id (a
   restore is an explicit user act that brings those nights back).
   device-bound columns are never taken from the file: `hc_record_id`,
   `hc_remote_version`, `hc_written`, `hc_remote_deleted`, `hc_error_*`
   keep their local values for existing ids and defaults for new ids.
   imported sessions from the file arrive without links, so the absence rule
   never deletes them (2.4); they re-link when a mirror night matches their
   key, and otherwise stay as detached imports (fixes swift defect 8).
4. active session: if the device already has an active session, the
   incoming active session is skipped ("Your device already has an active
   session; it stays active and the backup's active session is skipped.").
5. settings and appearance applied after commit. `healthSyncEnabled` is NOT
   applied (deviation: it is device and permission state; applying it from
   another device would lie about permission).
6. after import: refresh stores, reschedule wind-down notification, request
   `sync('full')` when enabled.
7. success alert: "Sessions imported: N new, U updated.\nSafety backup saved
   as <file>."

### 6.5 session export (`DataExporter` parity)

- csv header unchanged: `session_id,profile_name,start_time,end_time,break_start_time,break_end_time`;
  `profile_name = "Sleep"`, break columns empty; rfc 4180 escaping.
- markdown: same sections (metadata, aggregate summary, profiles, session
  log, footer). port uses "-" instead of the em dash and "In Progress" /
  "Completed" instead of emoji (repo style rules).
- options: sort ascending/descending by start, utc/local iso 8601 with ms.
- files: `twilight_backup_<yyyyMMdd_HHmmss>.json`,
  `twilight_sessions_<epoch>.csv|md`; shared with `expo-sharing`; import via
  `expo-document-picker` (`application/json`) and `expo-file-system`. add the
  three with `bunx expo install`.

### 6.6 ui

settings "Data" section (`src/components/settings/DataSection.tsx`, both
platforms, hidden while demo is active, swift parity) -> row "Import & Export
Data" -> `src/app/data-management.tsx`: "Backup & Restore" (Export Full
Backup, Import Backup, swift footer adapted without profiles and scheduler),
"Sorting", "Date & Time", "Session Export Format", export button. pickers use
the existing `MenuPicker` (ios menu, android material dropdown). alerts:
"Data Error", "Import Backup" (Cancel / Import), "Import Complete".

---

## 7. test plan

### 7.1 unit tests (jest, node:sqlite helper)

ported from `HealthKitSleepSyncTests.swift` (same names, hc inputs):

- clusterer (`testCollapsesStageSamplesIntoOneNight`,
  `testGapOverThreeHoursSplitsNights`, `testIgnoresTwilightAuthoredSamples`,
  `testPrefersAsleepEnvelopeOverInBed`, `testRehydratesOrphanedTwilightSamples`):
  collapses stage records into one night; gap over three hours splits
  nights; ignores own-package records; prefers asleep envelope over in-bed
  (stages vs session bounds); rehydrates orphaned twilight records. hc
  difference asserted explicitly: a foreign-package record with the twilight
  prefix is NOT ignored (2.2).
- reconciler (`testSkipsTombstonedNight`,
  `testSkipsOverlapWithTwilightOwnedSession`, `testUpdatesImportedNight`,
  `testInsertsWhenNoLocalMatch`, `testSkipsOverlapWithExistingImportedSession`,
  `testBatchUpdatesMatchingImportedAndSkipsOverlappingForeign`,
  `testBatchSkipsLaterOverlappingForeignInsert`): same cases.
- deletion classification (`testDeletionIgnoresTwilightAuthoredSamples`,
  `testDeletionRemovesImportedSessionForForeignSamples`): an own-record
  deletion never deletes a local session (it yields the remote-deletion
  policy outcome: held or aged out); a foreign deletion removes the record
  from the mirror and the import is deleted, shrunk, or detached by age.

ported from `DataArchiveTombstoneTests.swift`: tombstones round trip;
missing tombstone key decodes as empty.

new pure tests:

- record-to-sample mapping for every stage type, unknown and future stage
  values, no stages (asleep), awake-only stages (in bed); a no-stage record
  and a staged record of one source within 3 h form one night whose envelope
  covers both.
- night key: wake day from end offset, stable under device zone change;
  night spanning midnight; nap and night on the same wake day get distinct
  keys.
- update by record id when the key changed; merge (one night shares
  records with two imports -> bigger share updated, other `mergedInto`);
  split (import follows the larger part, other part inserted).
- tombstones: tombstoned record ids are removed before clustering (a new
  night merged with a deleted nap still imports, without the nap);
  other-source records overlapping a deleted import are tombstoned too (the
  second app's copy of that night does not come back).
- `skipAdopted`: the source moves an adopted night so it no longer overlaps
  -> no new import.
- superseded: a manual log over an imported night removes the import; deleting
  the log brings the import back.
- vanished import: linked and absent with evidence -> deleted; no links
  (archive restore) -> kept; absent without evidence (no older foreign
  record, no history permission) -> kept; tombstoned -> kept; ended more
  than 30 days ago -> detached, not deleted.
- vanished imports are excluded from overlap checks: a second source's
  night that the vanished import blocked is inserted in the same pass.
- overlapping foreign sources: two apps, same night -> one import (earliest
  start); the kept app deletes its record -> the other app's night imports
  in the same pass.
- `zoneForOffset`: device match, whole hour `Etc/GMT` (sign inversion),
  `+05:30` -> `Asia/Kolkata` with device in `Europe/Paris`, `-02:30` in
  newfoundland summer, unknown offset -> device zone, null offset, dst
  instant (start and end offsets differ across the fall-back night).
- outbound plan: skips active, invalid, imported, adopted, remote-deleted,
  poisoned-at-this-version, healthkit provider, demo prefix, demo tag,
  invalid zone (error); outbox for written-then-invalid; offsets computed per
  end at the exact instants.
- version rule: clock value after `+1` when the clock goes backwards;
  self-heal when a remote version is higher; replayed older own change does
  not lower `hc_remote_version`.
- remote-deletion policy: recent -> held; older than 30 days -> aged out
  without a card; keep -> no re-export; edit after keep -> exported again;
  "Pull" does not re-create held or aged-out nights.
- outbox planning: never-written owned session -> no outbox row; failed
  single delete + own read shows the record absent -> row dropped; write-only
  -> dropped after 5 failed runs; rate limit -> no attempt counted.
- connection state table and copy for every state and partial grant.
- pull result messages for empty, nothing new, imported, history hint.
- archive: validation errors, swift v1/v2 mapping, preview counts, merge
  rules (active conflict, tombstone union, demo ids dropped,
  `healthSyncEnabled` not applied), csv escaping, markdown snapshot.

repo and engine tests (in-memory sqlite + `FakeHealthConnect`):

the `FakeHealthConnect` must model the verified hc behaviors, or the engine
tests prove nothing: lower-or-equal version upserts are ignored silently;
`insertRecords` and `deleteRecords` are all-or-nothing; deleting a missing
id throws `E_HC_REMOTE`; range reads outside a configurable foreign window
trim silently while own reads are unlimited (android 14 mode) or limited
(android 13 mode); `getChanges` pages with `hasMore`, replays own changes,
and can return `tokenExpired`; any call can be set to throw a chosen error
once; permissions can be revoked between two calls.

- migration v0 -> v2 keeps rows and sets defaults (clock version); re-run is
  a no-op.
- edit bumps version; compare-and-set mark fails after a concurrent edit.
- delete owned written -> outbox + ledger rows; delete owned never written
  -> ledger row only; delete import -> tombstone with linked and
  other-source record ids; demo exit bulk delete -> no rows.
- enable -> full read imports foreign nights, exports owned nights, no echo.
- edit owned three times -> one hc record, latest version.
- adopted edit -> zero hc writes; deleting it -> no outbox row.
- local delete while disabled -> enable later -> remote delete, no
  rehydration.
- local delete -> write-only run drains the outbox -> read run replays the
  old own upsert -> no rehydration (ledger).
- outbox with one never-landed id among 50 -> batch fails -> single retries
  -> verify drops the missing one -> the rest delete; the outbox drains.
- foreign update/delete via changes -> import updates/deletes; delete and
  re-insert on two pages -> same local session id.
- crash after the last page commit, before reconcile -> next pass with zero
  changes still reconciles.
- remote delete of own records: 1 recent -> held card; 40 old (auto-delete
  simulation, one per day over 40 runs) -> no card, nothing deleted
  locally, nothing re-exported.
- token expired and invalid token -> silent full re-read, no duplicates.
- reinstall with write-only permission: hc holds version 5 from the old
  install, local restarts -> the next edit replaces the record (clock
  version).
- clock backwards: write, set the fake clock back a day, edit -> version
  still increases; with read granted, a higher remote version self-heals.
- device restore: db with a foreign `installId` -> reset runs once; owned
  sessions re-export; stale links do not delete imports.
- archive restore onto an empty hc -> restored imports survive two pulls.
- rate limit on batch 2 of 3 -> batch 1 marked synced, 2 and 3 pending, no
  per-record retries.
- invalid record -> poisoned at its version, skipped next run, exported
  after an edit.
- permission revoked between page 1 and page 2 -> page 1 committed, token
  of page 1 kept, no reconcile in this run (the next run with read
  permission continues from page 2 and then reconciles), permission state
  shown; `SecurityException` with permission still granted
  -> no error card.
- background request -> outbound only, no read calls.
- crash injection (adapter throws after write, after page, after outbox
  drain) -> re-run converges with no duplicates and no lost edits.
- single-flight: concurrent calls run at most twice; force resync wins.
- force resync -> writes only the sessions that differ, not every session.
- demo active -> no adapter calls at all (not only no writes).
- reinstall: empty db + own records in hc -> orphans rehydrated with remote
  versions and recording-method tags; ledger ids and demo ids are never
  rehydrated.
- disable -> token and mirror cleared, flags kept; re-enable -> full read.

gates after every commit: `bunx tsc --noEmit`, `bun run lint`, `bun run test`.
ios regression: `Platform` guards covered by component tests that render
settings and onboarding with `Platform.OS = 'ios'` and assert no hc text.

### 7.2 seeder app (outside the repo)

`/tmp/hcseeder`, package `com.rami.twilight.hcseeder`, minimal kotlin app
with connect-client 1.1.0, `READ_SLEEP` + `WRITE_SLEEP`, the rationale
activity and alias (hc requires them to grant), and one exported
`SeedActivity` driven by intent extras; results go to logcat tag `HCSEED`
and the activity finishes.

```
adb shell am start -n com.rami.twilight.hcseeder/.SeedActivity --es op insert \
  --es cid night-a --el start <ms> --el end <ms> --ei offset 3600 --es stages "2:<ms>:<ms>,1:<ms>:<ms>"
adb shell am start -n ... --es op update --es cid night-a --el version 2 --el start <ms> --el end <ms>
adb shell am start -n ... --es op delete --es cid night-a
adb shell am start -n ... --es op list            # logs every sleep record: id, origin, cid, version, method, offsets, times
adb shell am start -n ... --es op wipe            # deletes all seeder records
adb shell am start -n ... --es op insert --es stages none ...      # record without stages
adb shell am start -n ... --es op upsert-lower --es cid night-a    # lower version upsert, logs the returned id
adb shell am start -n ... --es op delete-missing                   # deleteRecords with an unknown client id, logs the exception
```

two foreign origins: build the seeder twice with `applicationIdSuffix`
(`com.rami.twilight.hcseeder` and `com.rami.twilight.hcseeder.b`) so the
"two apps record the same night" cases have two real data origins.

grant once: `adb shell pm grant com.rami.twilight.hcseeder android.permission.health.WRITE_SLEEP`
(and `READ_SLEEP`); if `pm grant` is refused, use the seeder's "Grant" button.

### 7.3 emulator e2e script

setup: `export JAVA_HOME=/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home`,
`export ANDROID_HOME=$HOME/Library/Android/sdk`, start
`Twilight_Pixel_9_B` on port 5570, `export ANDROID_SERIAL=emulator-5570`,
`bunx expo prebuild --clean --platform android`, `EXPO_PUBLIC_DEMO_MODE=0
bunx expo run:android --port 8083 --device Twilight_Pixel_9_B`. watch
`adb logcat` for `FATAL` and `ReactNativeJS` errors through every step.
state checks with `adb shell uiautomator dump`; visuals with
`adb exec-out screencap -p > /tmp/hc-<name>.png` then `sips -Z 700`.

1. seed foreign data before install: 3 nights in the last 7 days, 1 night
   split into 2 records with a 1 h gap, 1 night 45 days old, 1 night that
   will overlap a twilight log, 1 record with only awake stages, 1 record
   with NO stages, 1 record with a `+05:30` offset, 1 record whose cid is
   `twilight.sleep-session.fake` (a foreign package with the twilight
   prefix), and the same night written by both seeder builds
   (`com.rami.twilight.hcseeder` and `.b`, 7.2) to simulate two apps.
2. fresh install, onboarding: welcome -> health connect step (screenshot
   notDetermined) -> Continue -> hc dialog shows sleep read, write, past data
   -> allow all -> step shows connected. finish onboarding.
   expect: imported nights (split night = 1 session; no-stage record
   imported; awake-only record imported only if no asleep record of that
   source is within 3 h; prefixed foreign record imported as a foreign
   night; two-app night = 1 session; 45-day night present only with history
   permission). record whether the first read right after the grant
   returned the seeded data (2.10 item 10). screenshots: step, dashboard.
3. rationale: in hc app permissions for twilight, tap the privacy policy
   link -> native rationale opens; back returns to hc. dark and light. on
   android 14+ this goes through the `VIEW_PERMISSION_USAGE` alias.
4. export: add a manual log (not overlapping). seeder `list` shows one record
   with origin `com.rami.twilight.port`, cid `twilight.sleep-session.<id>`,
   a clock-based version (13 digits), manual-entry recording method, both
   offsets set. pull again: twilight session count unchanged (no echo).
5. edit that log twice -> `list`: same record id, higher version, new times.
6. delete it in twilight -> `list`: gone.
7. tracked session: Go to Sleep, wait 6 min, Wake Up -> record with actively
   recorded method.
8. overlap: log a night overlapping a seeded night -> after pull, one local
   night (twilight-owned wins; the import is superseded and removed).
   delete that log -> next pull imports the seeded night again.
9. delete an imported night in twilight -> hc still has it -> Pull -> it
   does not return (tombstone), and the second app's copy of that night does
   not return either.
10. foreign edit: seeder `update` a night's end -> foreground twilight ->
    import end updated, still one session, same session id. seeder `delete`
    -> import removed. seeder delete + insert of the same night in one go
    -> same local session id afterwards.
11. adopt: edit an imported night in twilight -> `list` shows NO new
    twilight record; seeder `update` the original (also move it so it no
    longer overlaps) -> twilight keeps the user edit and does not import a
    second copy.
12. hc-side delete of one recent twilight record (hc app -> data -> sleep
    -> entry -> delete) -> foreground -> twilight session still there, held
    card shown -> "Keep in Twilight" -> session stays, `list` shows it is not
    re-created; edit it -> it is exported again. repeat with "Remove from
    Twilight" -> session gone, no outbox error.
13. crash: seed 300 records, foreground, `adb shell am force-stop
    com.rami.twilight.port` during the pull, relaunch -> counts match a clean
    pull, no duplicates.
14. revoke read and write in hc -> settings shows "Permission denied" and
    "Open Health Connect" opens the permission page; deny the dialog twice
    and record whether hc still shows it (2.8); grant write only ->
    "export only" copy, and an edit still replaces the hc record; re-grant
    all.
15. demo: load sample data -> hc settings shows demo card; seeder `list`
    shows no new twilight records; log a real night during demo -> nothing
    exported; exit demo -> it exports, and no outbox error appears for the
    removed demo rows.
16. time zone: set `America/New_York` (`adb shell settings put global
    auto_time_zone 0` then set the zone in system settings), log a night,
    `list` shows the -18000/-14400 offset; the `+05:30` seeded night shows
    india local times (check that hermes `Intl` accepts `Asia/Kolkata` and
    `Etc/GMT-2`).
17. token path: `__DEV__`-only settings row "Invalidate Health Connect token"
    writes a bogus token -> next foreground does a silent full re-read, no
    duplicates, no error card. (the row writes no hc records.)
18. reinstall: `adb uninstall com.rami.twilight.port`, install again,
    connect -> twilight's own records rehydrate (tags from recording method),
    no duplicates against foreign imports; edit a rehydrated night -> the hc
    record updates (clock version beats the old install's version).
19. archive: export full backup to Downloads, `adb shell pm clear
    com.rami.twilight.port`, onboard without hc, import -> preview text ->
    confirm -> sessions and tombstones restored; enable hc -> no duplicate
    exports, tombstoned nights stay out, restored imports stay after two
    pulls.
20. empty state: wipe twilight data, enable hc with seeded data -> dashboard
    shows "No Health Connect sleep yet" + Pull -> alert with message.
21. visual pass on every new screen and state in dark and light, narrow
    font scale 1.3: no clipping, primary action obvious, held-deletion card
    and its destructive action below the primary emphasis.
22. hc facts to record (the docs do not state them): open hc -> manage data
    -> set auto-delete and write down the offered periods (the 30-day
    aged-out threshold in 2.6 assumes the shortest period is longer than 30
    days; change the threshold if not); the result of a `deleteRecords`
    call for a client record id that does not exist (expected
    `RemoteException`, 2.6); which id `insertRecords` returns for an
    ignored lower-version upsert (seeder op `upsert-lower`).
23. device restore: `adb shell bmgr enable true`, `adb shell bmgr backupnow
    com.rami.twilight.port`, uninstall, install, `adb shell bmgr restore
    com.rami.twilight.port` (or reinstall with restore) -> on launch the
    install-id reset runs once (logcat), the next sync is a full read,
    imports survive, owned nights are exported once, no duplicates.
24. background: start a session, background the app, end it from the
    notification action (if the parallel workstream has merged it), check
    logcat: outbound only, no read calls; foreground -> inbound runs.

ios: no simulator (owned by the other workstream). verify with tsc, jest,
and the platform-guard component tests.

---

## 8. open questions resolved

1. clientRecordId format: swift prefix `twilight.sleep-session.<id>` (prior
   art used `twilight:`). keeps one identity scheme across platforms.
2. full read vs changes: changes token + foreign mirror; full re-read only
   on first sync, expiry, force resync.
3. token expiry: silent full re-read with dedupe, not an error.
4. 30-day window: request optional history permission; absence needs links
   and read evidence (range reads trim silently).
5. remote deletion of twilight records: never deletes the local journal
   without a user action; recent ones are held for a decision, aged-out ones
   only stop exporting; no re-export until an edit (swift ignores them).
6. local deletion while sync is off: persistent outbox gated by
   `hc_written`, delete verify, permanent ledger; no resurrection.
7. version semantics: clock-based monotonic version on every mutation,
   compare-and-set mark synced, learn remote versions and self-heal.
8. night identity: hc night key with offset-based wake day + record-id
   matching for updates (merge and split rules); tombstoned record ids are
   removed before clustering.
9. stages: one SLEEPING stage on export; stage-to-kind mapping on import;
   clusterer kept for split nights.
10. recording method: manual entry for "Manual Log", actively recorded for
    tracked sessions, device type phone for both.
11. partial permissions: supported per direction.
12. connect-client 1.1.0 stable + app `minSdkVersion 26` via
    `expo-build-properties`.
13. rationale: native kotlin activity, not a deep link into rn.
14. background sync: none (swift parity). a background request runs
    outbound only; reads only in the foreground.
15. archive type: own `twilight-expo-backup` v1; swift backups importable
    one way; `healthSyncEnabled` not applied on import.
16. demo: sync fully paused while demo is active; outbound and archive
    filters as second layer.
17. adopted imports are NOT exported (hc write-back guidance, no
    overlapping duplicates in hc); the edit stays local. swift exports them.
18. ownership: own package only; the twilight prefix on another package's
    record does not make it own.
19. sdk unavailable: every hc surface hidden unless sync was already on.
20. device restore: no-backup install id; mismatch resets device-bound
    state.

## 9. planned DEVIATIONS.md and README.md updates (implementation tasks)

- remove the "healthkit sync ... data export/archive ... out of scope" cut
  and the "swift 0.10 apple health import ... not ported" cut.
- add: health connect replaces healthkit on android; ios has no health
  sync; every item of 2.10; swift defects fixed (1.10); archive type and
  one-way swift import; `healthSyncEnabled` not restored from backups;
  pre-import backups capped at 10; em dash and emoji removed from markdown
  export; onboarding is 5 steps on android, 4 on ios and on android
  devices where hc is unavailable; min sdk 26; archive import marks
  restored owned nights pending with a fresh version (swift copies the
  file's sync flags); `isHealthAdopted` archive field; edited imports stay
  local; remote deletions of twilight records never delete local nights
  silently; aged-out imports are detached; "Pull" repairs instead of
  rewriting.
- readme: health connect setup, seeder-based e2e (both seeder builds),
  data management.

---

## 10. critique log

adversarial review of the first draft (commit `c577b9e`) against the swift
sources, the hc docs (re-read, not from memory) and the repo. each entry:
problem -> resolution -> where. "verified" means the fact was checked in a
doc page listed at the top; "assumption" means no page states it and the
e2e run must record it.

### hc api facts the first draft got wrong or did not use

1. deleting a non-existing client record id throws, and `deleteRecords` is
   all-or-nothing (verified, reference). the draft enqueued every owned
   deletion, including never-written sessions, so one such row would fail
   its batch forever and block all later deletions. -> outbox only when
   `hc_written = 1` (write-ahead flag), single-id retry, verify by own read,
   bounded attempts. (2.5, 2.6)
2. range reads beyond the 30-day window trim silently; only single-record
   reads fail (verified, release notes 1.1.0-alpha11). the draft's absence
   rule trusted a stored `firstGrantedAt - 30 days`, which is wrong after
   an auto-backup restore or a re-grant, and then deletes imports hc just
   did not return. -> evidence-based absence (links + an older foreign
   record or history permission); reads always from epoch. (2.4)
3. on android 13 and lower the 30-day limit applies to own data too
   (verified, read-data). the draft assumed unlimited own reads for orphan
   rehydration. -> documented limit; reads from epoch are safe because they
   trim. (2.4)
4. `SDK_UNAVAILABLE`: "apps should hide any integration points" (verified,
   reference). the draft showed an unavailable onboarding step and card.
   -> new `hidden` state; row kept only if sync was already on. (2.7, 5.1,
   5.2)
5. "if your app has read data from health connect, that data shouldn't be
   written back" (verified, write-data). the draft exported adopted
   imports as manual entries, which also creates overlapping duplicates in
   hc. -> adopted imports are never written. (2.5)
6. recording method AND device type are mandatory (verified, write-data
   note and release notes). the draft named only the recording method and
   omitted the device for manual entries. -> both set for both methods.
   (2.1)
7. reads are foreground-only and "access ... may be interrupted at any
   point" (verified, sync-data). the draft could run inbound from a
   background push and would report a `SecurityException` from
   backgrounding as "permission denied". -> inbound only when active;
   re-check grants before showing a permission error. (2.3, 4.3)
8. rate limits: "retry from where the exception occurred", do not retry
   everything (verified, rate-limiting guide). the draft retried every
   failed batch record by record, also on rate limits. -> per-record retry
   only for validation errors; rate limit stops the run. (2.5)
9. unverified claims in the draft: "after two denials hc stops showing the
   dialog", "hc reads are consistent after the grant callback", "an
   invalid token also throws". -> marked as assumptions; the design no
   longer depends on them; e2e steps record them. (2.3, 2.8, 2.10, 7.3)
10. android auto backup is on by default (verified in
    `@expo/config-plugins` `AllowBackup.js`: `allowBackup ?? true`; this
    app does not set it). the draft did not consider a restored database
    carrying another device's token, record ids and links. -> no-backup
    install id and a one-time reset. (4.6)
11. hc auto-delete removes old data "each day" (verified, google support).
    with the draft's rule, own records removed by auto-delete deleted local
    nights a few per day, always under the 5-per-sync guard, and "keep"
    re-exported them into a daily deletion loop. -> remote deletions never
    delete locally without a user action; aged-out ones stop exporting
    without a card; no re-export until an edit. the period list is not in
    the docs (assumption, 7.3 step 22). (2.6)

### swift behaviors missed or mis-ported

12. swift `disableSync` clears the anchor and uuid map; the draft never
    defined disable. -> 4.7.
13. swift `enableSync` leaves sync off when permission is not granted; the
    draft's `enableSync` always enabled. -> enable only with read or write.
    (2.8)
14. the draft listed four swift defects; review found five more: the
    update-only "Imported 0 night(s)" message, other-source comeback after
    deleting an import, adopted duplicate after the source moves its night,
    restore wipe of imports, superseded import left next to a manual log.
    -> 1.10 items 5-9, each with a fix (5.5 copy uses `updatedCount`; 2.6
    tombstones other-source records; `skipAdopted`; links-required
    absence; superseded rule in 4.2).
15. swift archive import copies `needsHealthKitSync` and the version from
    the file. on hc, a restored lower version would be silently ignored.
    -> restored owned nights are pending with a clock version; deviation
    listed. (6.4, 9)
16. swift ownership accepts any sample with the twilight sync-identifier
    prefix. on hc a `clientRecordId` is per app, so a prefixed record from
    another package is not updatable by twilight; the draft kept the prefix
    rule, which would rehydrate it as owned, re-export a duplicate, and
    fail deletes. -> ownership by package only. (2.2)

### invariant violations in the draft

17. lost edit after reinstall, `pm clear` or archive restore: versions
    restarted at 2 while hc held a higher version; with write-only
    permission the draft never learned the remote version, so hc ignored
    every edit silently and the session was marked synced. -> clock-based
    versions, migration seeds the clock, self-heal when read is granted.
    (3.2, 3.3)
18. resurrection through the change feed: the draft rehydrated orphans from
    own upserts in a changes page and guarded only with outbox ids. a
    write-only run could drain the outbox before the next read replayed the
    old upsert. -> permanent deletion ledger; rehydration only from full
    own reads. (2.3, 2.6)
19. session churn: per-page reconcile turned a source's delete + re-insert
    on two pages into delete import + new session id, and a crash between a
    page commit and its reconcile left the mirror ahead of the sessions.
    -> pages change only the mirror; one reconcile per pass, always, from
    the committed mirror. (2.3, 4.2)
20. tombstone over-blocking: skipping any cluster that contains a
    tombstoned record also blocked a new night that a source merged with a
    deleted nap. -> tombstoned record ids removed before clustering. (4.2)
21. merge and split of nights with record-id matching were undefined (two
    imports matching one night). -> most-shared-records rule, `mergedInto`.
    (4.2)
22. vanished imports still blocked overlapping nights of a second source in
    the same pass (swift needs a second pull). -> vanished computed first
    and excluded. (4.2)
23. no-stage foreign records were mapped to in-bed and dropped from the
    envelope next to staged records of the same source. -> no stages =
    asleep. (2.1)
24. poison write: a record hc rejects was rewritten on every foreground.
    -> per-version error marker, error card names the night. (2.5)
25. half-hour offsets (india, nepal, central australia, newfoundland) fell
    back to the device zone, so imported nights showed wrong local times
    and could land on the wrong day. -> offset-matched candidate table.
    (3.5)
26. force resync rewrote every owned record (quota, churn) and, combined
    with remote deletions, re-created nights the user deleted in hc. ->
    repair only differences; never re-create remote-deleted nights. (2.5)
27. demo leak paths not covered: the bulk demo delete could enqueue outbox
    or ledger rows, and demo sessions could block or supersede real imports
    in reconcile. -> explicit exclusions. (3.4, 4.4)
28. `hc_remote_version` could go down when an older own change was
    replayed. -> max rule. (3.3)
29. archive restore copied device-bound columns semantics implicitly and
    left the deletion ledger blocking restored nights. -> device-bound
    columns never taken from files; ledger rows cleared for restored ids.
    (6.1, 6.4)

### missing tests

30. the draft's fake hc did not model the behaviors the design depends on
    (silent version ignore, transactional insert and delete, throw on
    missing id, silent window trim, foreground window per android
    version, replayed own changes, mid-run permission revoke). -> fake
    contract and about 40 new pure, repo and engine tests; swift tests
    mapped by name; e2e steps 22-24 record undocumented hc behavior. (7)

### checked and kept

- `.gitignore` anchors `/android`: `git check-ignore -v --no-index` shows
  `android/app/build.gradle` ignored and
  `modules/twilight-health-connect/android/...` not ignored.
- rn 0.88 defaults: `minSdk 24`, `compileSdk 37`, agp `9.2.1`
  (`node_modules/react-native/gradle/libs.versions.toml`); connect-client
  1.1.0 needs `compileSdk 36` and agp 8.9.1 (get-started); 1.2.0-alpha05
  lowers the library min sdk to 24 (release notes). the decision to stay on
  stable 1.1.0 with app `minSdkVersion 26` stands; hc sdk supports android
  8 (api 26), the hc app needs android 9 (get-started).
- upsert overwrites only on a strictly higher `clientRecordVersion`
  (verified twice: sync-data and write-data).
- tokens valid 30 days, `changesTokenExpired`, "read and dedupe all data"
  strategy, separate token per data type (verified).
- stage constants 0-7 (verified, `SleepSessionRecord` reference).
- rationale activity + android 14 `VIEW_PERMISSION_USAGE` alias with
  `HEALTH_PERMISSIONS` category and `START_VIEW_PERMISSION_USAGE`
  (verified, get-started).
- expo modules api: `RegisterActivityContracts` with
  `registerForActivityResult`, `OnActivityResult`, suspendable
  `AsyncFunction` bodies exist (expo module api docs).
