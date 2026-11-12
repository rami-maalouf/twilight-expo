# Expo HAS CHANGED

Read the exact versioned docs at https://docs.expo.dev/versions/v58.0.0/ before writing any code.


## Argent / Screenshot Cost Rules

To keep vision-token cost low during mobile UI work:
1. **Prefer trees over pixels:** Use `describe` or `debugger-component-tree` to verify state. Call `screenshot` only when the check is strictly visual (spacing, color, clipping, typography).
2. **Default scale is 0.2** via `ARGENT_SCREENSHOT_SCALE`. Do **not** pass `scale: 1` (or any scale above 0.2) for routine UI inspection or readability.
3. **Full-res only for diffs:** For `screenshot-diff` baselines/current captures, use `scale: 1` with `includeImageInContext: false` so the PNG is on disk but not loaded into model context.
4. **Batch interactions:** Prefer `run-sequence` for multi-step device actions. Wait with `await-ui-element` / `await-screen-idle` - never poll with repeated screenshots.
5. **Video is expensive and rarely needed:** Do not start `screen-recording-*` unless the question requires motion (animation, gesture path, timing/jank). Prefer a still + tree.
6. **Auto-screenshots are disabled globally** (`disable-auto-screenshot`). Do not re-enable. Take an explicit `screenshot` only when you need an image in context.

## Android e2e notes (Health Connect)

- Argent `debugger-evaluate` needs `device_id` (the adb serial) plus `port: 8083`; it returns promises unresolved, so stash async results on `globalThis` and read them in a second call.
- A raw CDP client must send `Origin: http://localhost:8083`, or Metro's inspector answers 401.
- Fast Refresh sometimes stops applying on the emulator; `adb shell am force-stop com.rami.twilight.port` and relaunch to load the new bundle.
- Deep links (`twilight://health-connect`, `twilight://log-editor?id=<id>`) reach any route quickly during e2e.
- After `adb uninstall` or `pm clear`, the debug app asks `10.0.2.2:8081` (the emulator's host alias), so `adb reverse` alone is not enough: write the dev-server pref before launch: `adb shell "run-as com.rami.twilight.port sh -c 'mkdir -p shared_prefs && echo \"<?xml version=\\\"1.0\\\" encoding=\\\"utf-8\\\" standalone=\\\"yes\\\" ?><map><string name=\\\"debug_http_host\\\">localhost:8083</string></map>\" > shared_prefs/com.rami.twilight.port_preferences.xml'"` plus `adb reverse tcp:8083 tcp:8083`.
- Do not use argent `reinstall-app` for Health Connect onboarding tests: it installs with `-g` and pre-grants the hc permissions. Use `adb install`.
- `uiautomator dump` fails on screens with the animated star field ("could not get idle state") and while argent's accessibility bridge is attached; use argent `describe`. If argent `gesture-tap` cannot start its simulator-server, tap with `adb shell input tap` at the `describe` frame centre (normalized x screen size).
- Clear twilight's hc records: hc settings -> App permissions -> Twilight -> See app data -> Enter deletion -> Select all -> Delete. App data lives in `files/SQLite/twilight.db` (copy with `adb exec-out run-as com.rami.twilight.port cat files/SQLite/twilight.db` plus `-wal`).
- Emulators need several GB of free host disk; the avd exits and refuses to start when the disk is full.
