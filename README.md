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

## Android home-screen widgets

Long-press the home screen, open **Widgets**, and pick **Twilight**:

| Widget | Size | Shows | Tap |
|--------|------|-------|-----|
| **Sleep Status** | 2x2 | "Gn" + moon; last night, bedtime and wake targets while awake; green with elapsed time, start and wake target while asleep | **Start Sleep** / **Wake Up** pill, anywhere else opens Twilight |
| **Sleep Mode** | 2x1 | Start Sleep (moon, Off) or Wake Up (sun, On), like the Swift control | Opens Twilight and starts or ends sleep |
| **Sleep Overview** | 4x2 | Last night's sleep vs goal, 7-night average, bedtime and wake targets | Opens Twilight |

Widgets follow Display Mode and Theme Color, and refresh on every session or
settings change, theme change, app foreground, and about once a minute while
asleep. Layouts live in `widgets/*.android.tsx`, the snapshot they render in
`src/services/home-widget-snapshot.ts`, the native config in
`plugins/android-widgets/` and `modules/twilight-widget-actions/`. iOS has no
home-screen widget (live activity only). After changing a layout, rebuild or
reload the app so it re-registers the layout; after changing the plugin or the
module, run `bunx expo prebuild --clean --platform android`.

## Sleep notification (Android Live Activity)

On Android the iOS Live Activity is an ongoing notification, on by default
(**Settings → Notifications → Sleep Notification**):

| When | Shows | Button |
|------|-------|--------|
| Asleep | "Rejuvenating...", elapsed timer, progress to the sleep goal, time left or "Goal reached" | **Wake Up** |
| Within 3 h of bedtime | "Winding down...", countdown to bedtime | **Start Sleep** |

Both buttons work with the app swiped away or the phone locked: the press
is recorded natively with its time and a headless JS task
(`src/services/session-action-task.ts`, registered in `index.ts`) applies
it. On Android 16 the sleep notification is promoted to a Live Update
(status bar chip). Native code: `modules/twilight-widget-actions`
(`TwilightSessionNotification.kt`); JS lifecycle shared with iOS:
`src/services/use-live-activity-sync.ts` and `live-activity.android.ts`.

```bash
# inspect it on a device or emulator
adb shell dumpsys notification --noredact | rg -A3 twilight.session
```

## Quick Settings tile and launcher shortcuts (Android)

- **Quick Settings**: edit the tiles and add **Twilight Sleep Mode**. It shows
  **Start Sleep** (moon, Off) or **Wake Up** (sun, On) and opens Twilight to
  start or end sleep, like the Swift Control Center control.
- **Launcher**: long-press the Twilight icon for **Start Sleep Mode** while
  awake or **Wake Up** while asleep; drag one out to pin it. A pinned one that
  no longer applies opens Twilight with "Sleep mode is already active." or
  "Sleep mode is not active.".

Both follow every session change (`src/services/sleep-controls.ts`); native
code in `modules/twilight-widget-actions` (`TwilightSleepTileService.kt`,
`TwilightSleepControls.kt`).

```bash
adb shell dumpsys shortcut | rg -A2 com.rami.twilight.port
# the tile as the shade shows it (label, secondaryLabel, state 1 off / 2 on)
adb shell dumpsys activity service com.android.systemui/.SystemUIService | rg -m1 TwilightSleepTile
```

## Rating prompt

From the third launch, once per app version, Twilight asks for a review
through `expo-store-review` (Swift `RatingManager` rule). It asks 2 s after
launch and only while the app is in front, past onboarding and awake;
otherwise it waits for the next launch. Launch count and the prompted version
live in the kv store under `twilight.rating.*`.

## Sleep links

`twilight://sleep/start` and `twilight://sleep/stop` start or end a session
from outside the app (Swift parity, both platforms), with the Swift
"Pause..." messages when sleep is already active or not active:

```bash
adb shell am start -a android.intent.action.VIEW -d twilight://sleep/start com.rami.twilight.port
xcrun simctl openurl booted twilight://sleep/stop
```

## Scope notes

Onboarding, dashboard, logs, metrics, and settings for sleep tracking are ported.
The home dashboard matches Swift 0.10: `Week | Trend | Time | SRI | Score`. SRI is
the Sleep Regularity Index (`src/domain/metrics/sleep-regularity.ts`), ported with
its Swift unit tests.
App blocking, HealthKit, NFC, tip jar, and related Swift extras are out of scope
(see `DEVIATIONS.md`). The Swift home-screen widget, Control Center control and
App Shortcuts are ported on Android only, as home-screen widgets, a Quick
Settings tile and launcher shortcuts.
