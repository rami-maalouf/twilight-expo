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
scope (see `DEVIATIONS.md`).

## Health Connect (Android)

Two-way sleep sync with Health Connect, ported from the Swift HealthKit sync
(`docs/health-connect.md`). Status: native module, sync core and engine are in;
the onboarding step and settings screen are not built yet.

- pure decisions: `src/domain/health/` (clusterer, reconciler, export planner)
- sql: `src/data/health-store.ts`, ownership hooks in `src/data/session-repo.ts`
- engine: `src/services/health-connect/sync-engine.ts` (single flight, runs on
  launch, foreground and after a night is saved, edited or deleted)
- tests use `tests/helpers/fake-health-connect.ts`

Dev-build e2e without the ui (Metro debugger):

```js
await globalThis.__twilightHealthSync.enableSync(); // requests access, turns sync on, full sync
globalThis.__twilightHealthSync.snapshot();          // status, last pull result, last error
```

Foreign sleep for tests comes from the throwaway seeder apps described in
`docs/health-connect.md` 7.2 (`com.rami.twilight.hcseeder` and `.b`).
