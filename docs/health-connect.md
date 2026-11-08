# health connect two-way sleep sync and data archive: design

status: design, ready for implementation on `feat/health-connect`.
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

---

## 2. mapping to health connect

### 2.1 record mapping

| swift / healthkit | health connect | decision |
|---|---|---|
| `HKCategorySample` sleepAnalysis | `SleepSessionRecord` (one per night) | one record per twilight session |
| `asleepUnspecified` value | `stages = [Stage(start, end, STAGE_TYPE_SLEEPING = 2)]` | one sleeping stage over the full session (parity with "unspecified asleep") |
| `HKMetadataKeySyncIdentifier` | `metadata.clientRecordId` | `"twilight.sleep-session.<session id>"`, same prefix as swift |
| `HKMetadataKeySyncVersion` | `metadata.clientRecordVersion` (Long) | `health_sync_version` (see 3.3) |
| `HKMetadataKeyTimeZone` (one zone) | `startZoneOffset`, `endZoneOffset` | per-end offsets from the session's start and end iana zones at each instant (kotlin `ZoneId.rules.getOffset`), dst-correct |
| `HKMetadataKeyWasUserEntered` | recording method | `Metadata.manualEntry(...)` for `tag == "Manual Log"` and adopted imports; `Metadata.activelyRecorded(device = Device(type = TYPE_PHONE), ...)` for tracked sessions. connect-client 1.1.0 makes recording method mandatory |
| twilight custom metadata keys | none (hc has no free metadata) | session id is recoverable from `clientRecordId`; zones from offsets |
| `sourceRevision.source.bundleIdentifier` | `metadata.dataOrigin.packageName` | ownership by origin (2.2) |
| sample uuid | `metadata.id` (record id) | stored for deletion changes (hc docs: `DeletionChange` carries only the id) |
| title, notes | `title = null`, `notes = null` | twilight writes nothing user-visible beyond the session |

stage mapping on read (`SleepSessionRecord.STAGE_TYPE_*`): `SLEEPING 2`,
`LIGHT 4`, `DEEP 5`, `REM 6`, `UNKNOWN 0` -> asleep (swift: unknown counts as
sleep); `AWAKE 1`, `OUT_OF_BED 3`, `AWAKE_IN_BED 7` -> awake. a record with no
stages, or only awake stages, contributes its session interval as an
`inBed`-kind envelope. a record with asleep stages contributes asleep
envelopes from those stages. this keeps the swift "prefer asleep over in-bed"
rule.

### 2.2 ownership on health connect

- own record: `dataOrigin.packageName == <app package>` OR
  `clientRecordId` starts with `twilight.sleep-session.`. the package check is
  the primary rule (hc docs: "only take changes that didn't come from the
  calling app"); the prefix check is swift parity.
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
  in one sqlite transaction together with `nextChangesToken`.
- foreign upserts and deletions update the mirror table `hc_records`; the
  engine re-clusters the whole mirror and reconciles. this keeps the swift
  "cluster from complete data" property without re-reading hc.
- own upserts are not imported. they teach the engine `hc_record_id` and the
  remote `clientRecordVersion` for the session, and rehydrate orphans.
- own deletions: see 2.6.

token expiry: an unused token expires within 30 days
(`changesTokenExpired == true`; an invalid token also throws). the engine
does NOT surface an error (prior art did). it clears the token and runs a full
re-read with dedupe (hc docs "read and dedupe all data", the recommended
strategy). dedupe is natural: the mirror is keyed by record id, imports by
night key and record ids.

### 2.4 read window, history permission

- default: an app reads other apps' data only back to 30 days before the
  first permission grant. on android 14+ an app reads its own data with no
  limit; on 13 and lower the 30-day limit also applies to own data.
- `android.permission.health.READ_HEALTH_DATA_HISTORY` removes the limit. it
  is requested together with read and write when the feature is available
  (`features.getFeatureStatus(FEATURE_READ_HEALTH_DATA_HISTORY)`). it is
  optional; denying it keeps sync working.
- full read = two reads: own records (`dataOriginFilter = own package`, from
  epoch) for orphans and id/version learning; all records from
  `coverageStart` for the foreign mirror.
- `coverageStart = epoch` with history permission, else
  `firstGrantedAt - 30 days` (`firstGrantedAt` is stored the first time the
  engine observes any granted permission).
- absence rule: during a full re-read an imported session is "vanished" only
  if its night lies fully inside `[coverageStart, now]`. imports older than
  the window are kept. swift has no window, so it always applies absence.
- page tokens: loop until `pageToken.isNullOrEmpty()` (hc note: some versions
  return `""`).

### 2.5 writing

- `insertRecords` upserts by `clientRecordId`. hc overwrites only when the new
  `clientRecordVersion` is HIGHER than the stored one; otherwise "the process
  ignores the change". swift healthkit replaces on any version, so the port
  must guarantee strictly increasing versions (3.3).
- batches of at most 50 writes (hc limit is 1000 per request; small batches
  keep a failure local). a failed batch is retried one record at a time to
  isolate the bad record.
- returned record ids are stored in `hc_record_id`. own upsert changes also
  carry the id, so a crash between write and store self-heals on the next
  changes pass.
- delete: `deleteRecords(SleepSessionRecord::class, recordIdsList = [],
  clientRecordIdsList = [...])` from the persistent deletion outbox.
- an owned session that was exported and later becomes invalid (shorter than
  5 min) is deleted remotely (swift leaves the stale sample).

### 2.6 deletions both ways

| deletion | swift | port |
|---|---|---|
| user deletes owned night in twilight | delete samples if enabled+authorized, else nothing (resurrection bug) | same transaction: delete row, add `clientRecordId` to `hc_pending_deletions` outbox (android). outbox drains on the next sync with write permission. orphan rehydration skips outbox ids |
| user deletes imported night in twilight | tombstone night key, health keeps original | tombstone night key + member record ids; hc keeps the original (parity) |
| foreign app deletes its record in hc | night vanishes on next full read -> local import deleted | `DeletionChange` removes the record from the mirror; re-cluster; the import updates (shrunk night) or is deleted when its night is gone |
| user deletes a twilight record in hc (hc ui) | ignored (`deletionAction` -> `.ignore`) | HC DIFFERENCE: `DeletionChange` with a known `hc_record_id` deletes the local session (task invariant "deletions propagate both ways"). mass-deletion guard below |

mass-deletion guard: if one sync would delete 5 or more twilight-owned
sessions because of remote deletions, the engine holds them in
`health_sync_state.heldRemoteDeletions` and the health connect screen shows a
card: "Health Connect removed N Twilight nights" with "Remove from Twilight"
and "Keep in Twilight". keep = clear `hc_record_id`, bump version, mark
pending (re-export). reason: "delete all Twilight data" in hc settings must
not silently wipe the local journal.

### 2.7 availability states

`HealthConnectClient.getSdkStatus(context)`:

| sdk status | port state | ui |
|---|---|---|
| `SDK_AVAILABLE` | `available` | normal flow |
| `SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED` | `providerUpdateRequired` (new, no healthkit equivalent) | "Update Health Connect" opens `market://details?id=com.google.android.apps.healthdata&url=healthconnect%3A%2F%2Fonboarding` |
| `SDK_UNAVAILABLE` | `unavailable` | swift "unavailable" copy adapted |
| ios / module missing | `unsupported` | every hc surface hidden |

android 14+ ships hc as a framework module, so `providerUpdateRequired` only
happens on android 13 and lower (apk provider). the manifest declares
`<queries><package android:name="com.google.android.apps.healthdata"/></queries>`.

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
  no grants + requested = `denied`. after two denials hc stops showing the
  dialog; the request resolves with no grants, which lands in `denied` with
  "Open Health Connect" (`HealthConnectClient.getHealthConnectManageDataIntent`).
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
  writes the nights you record or edit, and can update or delete only those;
  you stay in control), the read-window note, and a privacy policy link. copy
  must match the play console privacy policy.
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

1. read window (30 days) vs full history -> history permission requested,
   coverage-limited absence rule (2.4).
2. changes token vs full read every sync -> mirror + token, full re-read only
   on first sync, token expiry, force resync (2.3).
3. version must strictly increase vs replace on any write -> every edit bumps
   (3.3), remote version learning.
4. deletion changes carry only the record id -> store `hc_record_id` and the
   mirror ids.
5. one record with stages vs many stage samples -> stage-to-kind mapping; the
   clusterer still runs because some sources split one night into several
   sessions (naps, interrupted nights).
6. per-end zone offsets vs one zone id -> write both offsets; on read map
   offsets back to zone ids (3.5).
7. separate read and write status vs write-only status -> partial states.
8. provider update required state -> new ui state and play store action.
9. remote deletion of own records -> propagates locally with a guard (2.6).
10. no `retryEmptyImport` 800 ms re-read: that was a healthkit quirk right
    after the permission sheet; hc reads are consistent after the grant
    callback.
11. no custom metadata -> session id from `clientRecordId`, original tag from
    recording method on rehydration.
12. rationale activity and play console declaration are mandatory on android.

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
alter table sleep_sessions add column health_provider text;            -- 'health_connect' | 'healthkit' | null
alter table sleep_sessions add column health_night_key text;
alter table sleep_sessions add column health_source_id text;           -- data origin package / bundle id
alter table sleep_sessions add column needs_health_sync integer not null default 1;
alter table sleep_sessions add column health_sync_version integer not null default 2;
alter table sleep_sessions add column hc_record_id text;               -- own record id in hc
alter table sleep_sessions add column hc_remote_version integer;       -- last clientRecordVersion seen in hc

create table if not exists health_tombstones (
  night_key text primary key not null,
  deleted_at integer not null,
  record_ids text not null default '[]'                                -- json array of hc record ids
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
create table if not exists hc_pending_deletions (                      -- remote delete outbox
  client_record_id text primary key not null,
  session_id text not null,
  created_at integer not null
);
create table if not exists health_sync_state (key text primary key not null, value text not null);
create index if not exists idx_sessions_hc_record on sleep_sessions(hc_record_id);
```

`health_sync_state` keys: `changesToken`, `coverageStart`, `firstGrantedAt`,
`permissionRequestedAt`, `lastFullReadAt`, `lastSuccessAt`, `lastError`
(json `{code, message, at}`), `lastPullResult` (json, swift shape),
`heldRemoteDeletions` (json). they live in `twilight.db` so the token commits
in the same transaction as mirror and session changes.

`healthSyncEnabled` goes to `SettingsStore` (kv) with a validator and default
`false` (swift parity: UserDefaults bool).

existing rows get `needs_health_sync = 1`, version 2: the first enable exports
the existing journal, as swift does. demo rows are excluded by rule (4.4).

`SqlDatabase` gains `withTransactionSync(fn)` (expo-sqlite has it; the
`node:sqlite` test helper wraps `BEGIN`/`COMMIT`/`ROLLBACK`).

### 3.3 version rule (fixes swift defect 1)

- every mutation of an owned, ended session (`endActiveSession`,
  `updateSession`, archive overwrite, "keep" after remote deletion, force
  resync) sets `needs_health_sync = 1` and `health_sync_version += 1`
  (minimum 2). swift bumps only when not already pending; the port always
  bumps.
- `writeVersion = max(health_sync_version, (hc_remote_version ?? 0) + 1)`;
  stored back before the write.
- mark synced is compare-and-set:
  `update ... set needs_health_sync = 0, hc_record_id = ?, hc_remote_version = ?
  where id = ? and health_sync_version = ?`. an edit during the write changes
  the version, the update matches zero rows, and the session stays pending.
- payload migration: `HEALTH_PAYLOAD_MIN_VERSION = 2`; sessions below it get
  version = min and pending (swift `prepareForCurrentHealthKitPayload`).
  bumping the constant later re-exports everything.

### 3.4 repository changes (`src/data/session-repo.ts`)

- `SleepSession` gains `health: { imported, provider, nightKey, sourceId,
  needsSync, syncVersion, hcRecordId, hcRemoteVersion }`. ui code keeps using
  the existing fields.
- `updateSession` (editor): adopt if imported (`is_health_imported = 0`, keep
  night key and links), bump version, pending. "user edits win": an adopted
  session is owned, so later source updates hit `skipOverlapsTwilightOwned`.
- `deleteSession(id)` -> one transaction: tombstone if `health_night_key`
  (key + linked record ids), delete links, enqueue
  `twilight.sleep-session.<id>` in the outbox when the session is owned, not
  demo, and the repo was built with `recordRemoteDeletions = true` (android),
  then delete the row.
- `createManualLog` / `startSession`: defaults (pending, v2).
- new `HealthStore` (`src/data/health-store.ts`): all sql for mirror, links,
  tombstones, outbox, sync state, and `applyInboundPlan(plan)` /
  `markSynced(...)` as single transactions.

### 3.5 time zones

- export: kotlin computes offsets from the iana ids at the exact instants.
  invalid or missing zone -> the session is not written and the engine
  reports the swift `missingTrackedTimeZone` copy adapted to hc. the core
  validates zones with `Intl.DateTimeFormat` before planning.
- import: `zoneForOffset(offsetSec, instant, deviceZone)`: device zone if its
  offset at that instant matches; else `Etc/GMT∓h` for whole-hour offsets
  (note posix sign inversion); else the device zone. null offset -> device
  zone (swift fallback is `TimeZone.current`). start and end map
  independently. hermes `Intl` support for `Etc/GMT*` must be checked on the
  emulator; fallback is the device zone.
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
  requestPermissions(options: { history: boolean }): Promise<HcStatus>;
  openPermissionSettings(): Promise<void>;
  openProviderInstall(): Promise<void>;
  getChangesToken(): Promise<string>;
  getChanges(token: string): Promise<HcChangesPage>;
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
`IllegalStateException` with quota text -> rate limit, `RemoteException` ->
remote, `IOException` -> io, `IllegalArgumentException` -> invalid, token
errors -> token). defensive guard: `upsertSleep` and delete reject any
`clientRecordId` without the twilight prefix. `index.ts` exports the typed
native module.

### 4.2 engine algorithm

`sync(kind)` with `kind = 'full' | 'push' | 'forceResync'`:

```
guard: platform android, adapter present, settings.healthSyncEnabled,
       !settings.isDemoDataActive                      -> else skip result (swift messages)
status = adapter.getStatus(); store status; record firstGrantedAt
availability != available                              -> lastError unavailable / update required
!read && !write                                        -> lastError permission
runExclusive:
  0. payload migration (sql)
  1. inbound (read granted, kind != 'push'):
     forceResync: clear token + mirror (keep tombstones and links), bump all owned valid
     no token -> fullRead:
        token = getChangesToken()
        own   = readSleep(own, from epoch)                  paged
        all   = readSleep(all, from coverageStart)           paged
        tx: replace mirror rows inside window with foreign(all)
            learn own ids/versions; rehydrate orphans (skip outbox ids, existing ids)
            planInbound -> insert/update imports, vanished imports inside window
            save token, coverageStart, lastFullReadAt
     loop getChanges(token):
        tokenExpired or E_HC_TOKEN -> clear token, goto fullRead (once per run)
        tx per page: planChangesPage + planInbound; owned remote deletions
            (or hold them if >= 5 this run); save nextToken
  2. outbound (write granted):
     drain outbox in batches of 50 -> tx delete outbox rows
     planOutbound -> writes for owned, ended, valid, non-demo, pending, valid zone
                  -> deletes for exported sessions that became invalid
     upsert in batches -> per result tx compare-and-set markSynced
  3. lastSuccessAt; lastPullResult (inbound runs only); lastError only for real errors
```

order inbound-then-outbound is swift parity. `push` (after a local change)
skips inbound unless no full read ever happened.

### 4.3 concurrency

- single-flight: one promise. a request during a run records the highest
  pending kind (`forceResync > full > push`) and runs once more after the
  current run. no busy wait (swift polls every 50 ms).
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
  `DEMO_SESSION_ID_PREFIX` or `tag == 'Demo Log'`; the kotlin guard only
  accepts the twilight prefix; repo never enqueues outbox rows for demo ids;
  inbound never creates demo-prefixed ids.
- real sessions logged during demo stay pending and export after exit.
- `EXPO_PUBLIC_DEMO_MODE=1` builds seed demo on every launch and keep
  `isDemoDataActive` true, so they never talk to hc.
- archives: the data section is hidden while demo is active (swift parity);
  the exporter also drops demo-prefixed ids; the importer refuses while demo
  is active and drops demo-prefixed ids from files.

### 4.5 invariants and how they hold

| invariant | mechanism | test |
|---|---|---|
| no duplicate nights locally | reconciler overlap skips + in-batch skip; record-id and key matching for updates; mirror keyed by record id | reconciler batch tests, engine "full read twice" test |
| no echo import | own origin + prefix filter before clustering; own changes never imported | clusterer "ignores twilight authored", engine export-then-pull test |
| no duplicate twilight records in hc | stable `clientRecordId` upsert | fake-hc engine test: edit 3 times -> 1 record |
| user edits win | adoption on edit; owned overlap beats foreign; versions only go up | adopt test, foreign update after adopt test |
| deletions propagate both ways | outbox (local -> hc), tombstones (imports), `DeletionChange` (hc -> local) with guard | outbox, tombstone, remote-delete, guard tests |
| nothing lost on crash mid-sync | page + token in one transaction; outbox persisted with the row delete; compare-and-set mark; own upsert changes repair missing ids; re-run is idempotent | engine tests that throw between steps and re-run |
| demo never exported | 4.4 | demo tests on planner and engine |
| exactly one active session | archive import skips incoming active when one exists; inbound only creates ended sessions | archive merge test |

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
| `unavailable` | availability unavailable |
| `updateRequired` | provider update required |
| `connected` | enabled and (read or write); sub-flag `importOnly` / `exportOnly` |
| `readyToEnable` | not enabled and (read or write) |
| `notDetermined` | no grants, never requested |
| `denied` | no grants, requested |

### 5.2 onboarding step (android only)

- route `src/app/onboarding/health-connect.tsx`, order on android: welcome ->
  health connect -> schedule -> notifications -> sample data (swift order:
  feature overview -> apple health -> schedule ...). welcome "Get Started"
  pushes `health-connect` on android and `schedule` on ios (one-line change).
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
  Connect", "Writes the sleep sessions you record or edit", "You stay in
  control"), status card with summary and tips, held-deletion card (2.6),
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
| pull: imported | "Imported N night(s) from Health Connect (K session(s))." |

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
      "isHealthImported": false, "healthProvider": null,
      "healthExternalNightKey": null, "healthSourceIdentifier": null
    }
  ],
  "healthSleepTombstones": [{ "nightKey": "...", "deletedAt": "...", "recordIds": [] }]
}
```

not archived: hc token, mirror, links, outbox, record ids, permission state
(device-bound; swift also omits anchor and uuid map).

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
   (archive record overwrites; local-only sessions stay); for owned ended
   sessions that are new or changed: pending + version bump (3.3); union
   tombstones (existing keys win, record ids merged); drop demo-prefixed ids.
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

- clusterer: collapses stage records into one night; gap over three hours
  splits nights; ignores twilight-authored records (own origin and prefix);
  prefers asleep envelope over in-bed (stages vs session bounds); rehydrates
  orphaned twilight records.
- reconciler: skips tombstoned night; skips overlap with twilight-owned;
  updates imported night; inserts when no local match; skips overlap with
  existing imported; batch updates matching imported and skips overlapping
  foreign; batch skips later overlapping foreign insert.
- deletion classification: twilight-authored deletion maps to the owned
  session (hc difference, asserted explicitly); foreign deletion affects the
  imported session.

ported from `DataArchiveTombstoneTests.swift`: tombstones round trip;
missing tombstone key decodes as empty.

new pure tests:

- record-to-sample mapping for every stage type, unknown stage, no stages.
- night key: wake day from end offset, stable under device zone change.
- update by record id when the key changed; tombstone match by record id.
- vanished import inside window deleted; outside window kept; tombstoned
  kept.
- `zoneForOffset`: device match, whole hour `Etc/GMT`, half hour fallback,
  null offset, dst instant.
- outbound plan: skips active, invalid, imported, healthkit provider, demo
  prefix, demo tag, invalid zone (error); deletes exported-then-invalid;
  version = max(local, remote + 1).
- connection state table and copy for every state and partial grant.
- pull result messages for empty, nothing new, imported, history hint.
- archive: validation errors, swift v1/v2 mapping, preview counts, merge
  rules (active conflict, tombstone union, demo ids dropped,
  `healthSyncEnabled` not applied), csv escaping, markdown snapshot.

repo and engine tests (in-memory sqlite + `FakeHealthConnect`):

- migration v0 -> v2 keeps rows and sets defaults; re-run is a no-op.
- edit bumps version; compare-and-set mark fails after a concurrent edit.
- delete owned -> outbox row; delete import -> tombstone with record ids.
- enable -> full read imports foreign nights, exports owned nights, no echo.
- edit owned three times -> one hc record, latest version.
- local delete while disabled -> enable later -> remote delete, no
  rehydration.
- foreign update/delete via changes -> import updates/deletes.
- remote delete of own record -> local delete; 5+ -> held; keep -> re-export.
- token expired -> full re-read, no duplicates.
- crash injection (adapter throws after write, after page) -> re-run
  converges with no duplicates and no lost edits.
- single-flight: concurrent calls run at most twice; force resync wins.
- demo active -> no adapter write calls at all.
- reinstall: empty db + own records in hc -> orphans rehydrated with remote
  versions and recording-method tags.

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
adb shell am start -n ... --es op list            # logs every sleep record: id, origin, cid, version, times
adb shell am start -n ... --es op wipe            # deletes all seeder records
```

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
   will overlap a twilight log, 1 record with only awake stages.
2. fresh install, onboarding: welcome -> health connect step (screenshot
   notDetermined) -> Continue -> hc dialog shows sleep read, write, past data
   -> allow all -> step shows connected. finish onboarding.
   expect: imported nights (split night = 1 session; 45-day night present
   only with history permission). screenshots: step, dashboard.
3. rationale: in hc app permissions for twilight, tap the privacy policy
   link -> native rationale opens; back returns to hc. dark and light.
4. export: add a manual log (not overlapping). seeder `list` shows one record
   with origin `com.rami.twilight.port`, cid `twilight.sleep-session.<id>`,
   version 2, offsets set. pull again: twilight session count unchanged (no
   echo).
5. edit that log twice -> `list`: same record id, version 4, new times.
6. delete it in twilight -> `list`: gone.
7. tracked session: Go to Sleep, wait 6 min, Wake Up -> record with actively
   recorded method.
8. overlap: log a night overlapping seeded night -> after pull, one local
   night (twilight-owned wins).
9. delete an imported night in twilight -> hc still has it -> Pull and
   force resync -> it does not return (tombstone).
10. foreign edit: seeder `update` a night's end -> foreground twilight ->
    import end updated, still one session. seeder `delete` -> import removed.
11. adopt: edit an imported night in twilight -> exported as twilight record;
    seeder `update` the original -> twilight keeps the user edit.
12. hc-side delete of a twilight record (hc app -> data -> sleep -> delete) ->
    foreground -> twilight session removed. delete 5+ twilight records at
    once -> held-deletion card -> test both "Keep" (re-exported) and "Remove".
13. crash: seed 300 records, foreground, `adb shell am force-stop
    com.rami.twilight.port` during the pull, relaunch -> counts match a clean
    pull, no duplicates.
14. revoke read and write in hc -> settings shows "Permission denied" and
    "Open Health Connect" opens the permission page; grant write only ->
    "export only" copy; re-grant all.
15. demo: load sample data -> hc settings shows demo card; seeder `list`
    shows no new twilight records; log a real night during demo -> nothing
    exported; exit demo -> it exports.
16. time zone: set `America/New_York` (`adb shell settings put global
    auto_time_zone 0` then set the zone in system settings), log a night,
    `list` shows the -18000/-14400 offset; import shows correct local times.
17. token path: `__DEV__`-only settings row "Invalidate Health Connect token"
    writes a bogus token -> next foreground does a silent full re-read, no
    duplicates, no error card. (the row writes no hc records.)
18. reinstall: `adb uninstall com.rami.twilight.port`, install again,
    connect -> twilight's own records rehydrate (tags from recording method),
    no duplicates against foreign imports.
19. archive: export full backup to Downloads, `adb shell pm clear
    com.rami.twilight.port`, onboard without hc, import -> preview text ->
    confirm -> sessions and tombstones restored; enable hc -> no duplicate
    exports, tombstoned nights stay out.
20. empty state: wipe twilight data, enable hc with seeded data -> dashboard
    shows "No Health Connect sleep yet" + Pull -> alert with message.
21. visual pass on every new screen and state in dark and light, narrow
    font scale 1.3: no clipping, primary action obvious.

ios: no simulator (owned by the other workstream). verify with tsc, jest,
and the platform-guard component tests.

---

## 8. open questions resolved

1. clientRecordId format: swift prefix `twilight.sleep-session.<id>` (prior
   art used `twilight:`). keeps one identity scheme across platforms.
2. full read vs changes: changes token + foreign mirror; full re-read only
   on first sync, expiry, force resync.
3. token expiry: silent full re-read with dedupe, not an error.
4. 30-day window: request optional history permission; absence rule limited
   to the coverage window.
5. remote deletion of twilight records: propagate locally, with a 5-night
   hold guard (swift ignores them).
6. local deletion while sync is off: persistent outbox; no resurrection.
7. version semantics: always bump on edit, compare-and-set mark synced,
   learn remote versions.
8. night identity: hc night key with offset-based wake day + record-id
   matching for updates and tombstones.
9. stages: one SLEEPING stage on export; stage-to-kind mapping on import;
   clusterer kept for split nights.
10. recording method: manual entry for "Manual Log" and adopted imports,
    actively recorded (phone) for tracked sessions.
11. partial permissions: supported per direction.
12. connect-client 1.1.0 stable + app `minSdkVersion 26` via
    `expo-build-properties`.
13. rationale: native kotlin activity, not a deep link into rn.
14. background sync: none (swift parity).
15. archive type: own `twilight-expo-backup` v1; swift backups importable
    one way; `healthSyncEnabled` not applied on import.
16. demo: sync fully paused while demo is active; outbound and archive
    filters as second layer.
17. adopted imports export to hc (swift parity) as manual entries; the
    foreign original stays, so hc may hold both. hc data priority resolves
    aggregates; locally there is one night.

## 9. planned DEVIATIONS.md and README.md updates (implementation tasks)

- remove the "healthkit sync ... data export/archive ... out of scope" cut
  and the "swift 0.10 apple health import ... not ported" cut.
- add: health connect replaces healthkit on android; ios has no health
  sync; every item of 2.10; swift defects fixed (1.10); archive type and
  one-way swift import; `healthSyncEnabled` not restored from backups;
  pre-import backups capped at 10; em dash and emoji removed from markdown
  export; onboarding is 5 steps on android, 4 on ios; min sdk 26.
- readme: health connect setup, seeder-based e2e, data management.
