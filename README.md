# Twilight (Expo port)

Sleep tracker port of the Swift Twilight app. Expo SDK 58 / React Native 0.88.
Routes live under `src/app/`.

## Production vs demo

| Mode | What you get |
|------|----------------|
| **Production** (default) | Empty DB, full onboarding, log real sleep from day one |
| **Demo** | Seeds ~100 sample nights on launch, skips onboarding, charts filled |

### Run production

```bash
bun install
bun run ios:prod
# or
bun run start:prod
```

Default `bun run ios` / `bun run start` are also production (demo env unset).

### Run demo

```bash
bun run ios:demo
# or
bun run start:demo
```

### Switch without rebuilding

- **Settings → Sample Data → Load Sample Sleep History** - optional charts with seeded nights
- **Settings → Demo Data → Exit Demo and Continue in App** - removes sample nights and restores your schedule
- Onboarding ends with an optional sample-data offer; **Skip for now** leaves you in a clean production app

### EAS profiles

- `production`, `preview`, `development` - `EXPO_PUBLIC_DEMO_MODE=0`
- `preview-demo`, `development-demo` - `EXPO_PUBLIC_DEMO_MODE=1`

## First-run flow (production)

1. Welcome
2. Sleep schedule
3. Notification permission (optional)
4. Optional sample data (Skip or Explore)

Then: **Go to Sleep** / **Wake Up** on Home, or add manual logs from Logs.

## Scope notes

Onboarding, dashboard, logs, metrics, and settings for sleep tracking are ported.
The home dashboard matches Swift 0.10: `Week | Trend | Time | SRI | Score`. SRI is
the Sleep Regularity Index (`src/domain/metrics/sleep-regularity.ts`), ported with
its Swift unit tests.
App blocking, HealthKit on iOS, NFC, tip jar, and related Swift extras are out of
scope (see `DEVIATIONS.md`). Android syncs sleep with Health Connect (below).

## Health Connect (Android)

Two-way sleep sync with Health Connect, ported from the Swift HealthKit sync
(`docs/health-connect.md`). Android only; iOS shows no Health Connect surface.

- turn it on in onboarding (step after welcome) or Settings -> Health Connect;
  the screen shows connection state, last sync, held deletions, Pull, Sync now
  (write-only), Turn off and Open Health Connect. An empty dashboard offers
  "Pull from Health Connect". Sync runs on launch, foreground, Pull and after a
  night is saved, edited or deleted.
- pure decisions: `src/domain/health/` (clusterer, reconciler, export planner,
  connection state and ui copy in `connection-state.ts`)
- ui: `src/app/health-connect.tsx`, `src/app/onboarding/health-connect.tsx`,
  `src/components/settings/HealthConnectSection.tsx`,
  `src/components/dashboard/WeekEmptyState.tsx`
- sql: `src/data/health-store.ts`, ownership hooks in `src/data/session-repo.ts`
- engine: `src/services/health-connect/sync-engine.ts` (single flight, runs on
  launch, foreground and after a night is saved, edited or deleted)
- tests use `tests/helpers/fake-health-connect.ts`

Dev-build e2e helpers (Metro debugger; dev builds also show an "Invalidate
Health Connect token (dev)" row on the Health Connect screen):

```js
await globalThis.__twilightHealthSync.enableSync(); // requests access, turns sync on, full sync
globalThis.__twilightHealthSync.snapshot();          // status, last pull result, last error
```

The Metro inspector only accepts debugger connections whose `Origin` matches
the dev server (`http://localhost:8083`).

Foreign sleep for tests comes from the throwaway seeder apps described in
`docs/health-connect.md` 7.2 (`com.rami.twilight.hcseeder` and `.b`).

## Data export and import (both platforms)

Settings -> Data -> Import & Export Data (hidden while sample data is active),
ported from Swift `DataArchiveManager` / `DataExporter`
(`docs/health-connect.md` 6 and 13):

- Export Full Backup writes a versioned `twilight-expo-backup` JSON file
  (sessions, sleep settings, appearance, Health Connect tombstones). Import
  Backup previews the merge, saves a safety backup to `<documents>/DataBackups`
  (newest 10 kept) and merges by session id. Swift `twilight-full-backup`
  files import one way.
- CSV and Markdown session export with sort order and UTC/local timestamps.
- iOS exports through the share sheet ("Save to Files" lives there). Android
  asks "Save to Device" or "Share": Save to Device opens the system
  create-document picker (Downloads or any folder, editable file name) through
  the local module `modules/twilight-document-save`, because the Android share
  sheet has no local save target.
- pure format, validation and merge rules: `src/domain/archive/`; file io and
  wiring: `src/services/archive/`, `src/data/archive-repo.ts`; ui:
  `src/app/data-management.tsx`, `src/components/settings/DataSection.tsx`.
