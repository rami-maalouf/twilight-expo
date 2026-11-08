# Twilight EAS Simulator demo runbook

Status: dry run passed on August 31, 2026.

Go for filming. The simulator build opens directly into seeded sample data, and the
two-tap flow from Home to Score to Metrics was verified in EAS Simulator.

## Verified inputs

- Expo account: `ramimaalouf`
- EAS project: `@ramimaalouf/twilight`
- Project ID: `fab317b8-801d-4363-a705-0cde82178c3c`
- iOS bundle identifier: `com.rami.twilight.port`
- Source checkout HEAD: `7a2dbeb`
- Source state: the build contains the current dirty Fable 5 worktree used for the
  comparison video. EAS has no git commit metadata because the app was archived with
  `EAS_NO_VCS=1` from its own project root.
- Simulator build ID: `8fba082f-f3e3-472d-8cb1-0fe8c662f974`
- Build fingerprint: `2872363e535de0a5c1eb991620ae3e755aa44483`
- Build profile: `simulator-demo`
- Build artifact: [open on expo.dev](https://expo.dev/accounts/ramimaalouf/projects/twilight/builds/8fba082f-f3e3-472d-8cb1-0fe8c662f974)
- Dry-run session ID: `01a0582b-298c-7af6-910c-b82762b42378`
- Dry-run viewport: iOS, `402x874`
- Local evidence: `.artifacts/eas-simulator/demo-shot.png`

The current build expires on November 29, 2026. Rebuild after that date or whenever the
filming source changes.

## One-time project setup

`eas.json` contains a simulator-only demo profile:

```json
"simulator-demo": {
  "extends": "preview-demo",
  "ios": {
    "simulator": true
  }
}
```

The inherited `preview-demo` profile sets `EXPO_PUBLIC_DEMO_MODE=1`. On a fresh install,
Twilight skips onboarding and seeds enough sleep history to populate Home and Metrics.
No off-camera data entry is required.

`.easignore` limits the EAS archive to app source. This matters because the enclosing
git repository contains all comparison apps and otherwise produces an upload over 500 MB.

## Preflight

Run from the Fable 5 app directory:

```bash
npx --yes eas-cli@latest whoami
npx --yes eas-cli@latest simulator:list --status in-progress --platform ios --limit 20
npx --yes eas-cli@latest build:view 8fba082f-f3e3-472d-8cb1-0fe8c662f974 --json
```

Proceed only when:

- the account is `ramimaalouf`
- no other iOS simulator session is active
- the build status is `FINISHED`
- `isForIosSimulator` is `true`
- the build fingerprint matches the value above

## Rebuild when the source changes

Set the app directory explicitly so EAS archives only Fable 5 and honors its
`.easignore` file:

```bash
task_eas_root="/Users/rami/Documents/life-os/expo/content/demos/ai-model-comparison/apps/swift-rewrite/fable-5"
EAS_NO_VCS=1 EAS_PROJECT_ROOT="$task_eas_root" \
  npx --yes eas-cli@latest build \
  --platform ios \
  --profile simulator-demo \
  --non-interactive \
  --wait
```

After a successful rebuild, replace the build ID, fingerprint, artifact link, and source
state in this runbook before filming.

## Start the filming session

Start with strict duration and idle limits because EAS Simulator sessions are billed
while active:

```bash
npx --yes eas-cli@latest simulator:start \
  --platform ios \
  --type agent-device \
  --build-id 8fba082f-f3e3-472d-8cb1-0fe8c662f974 \
  --name "Twilight teaser final take" \
  --max-duration-minutes 20 \
  --max-idle-time-minutes 5 \
  --non-interactive
```

Do not open the web preview in a local browser for the agent workflow. The start command
installs and launches the build, and writes the short-lived connection details to the
ignored `.env.eas-simulator` file.

Explicitly open Twilight before taking the first snapshot:

```bash
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest open com.rami.twilight.port --platform ios
```

## Filmed flow

Keep the visible interaction short:

1. Show the seeded Home dashboard in the default Trend view.
2. Tap `Score` to reveal the Sleep Alignment Score chart.
3. Tap the native `Metrics` tab to reveal the long-range dashboard.
4. Hold on Metrics long enough to read the populated overview and highlights.

Use a fresh interactive snapshot immediately before every press. Agent-device refs expire
after the UI changes, so never reuse the refs shown in this document.

```bash
# home: locate the current score button ref
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest snapshot -i --platform ios
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest press <score-ref> --platform ios

# score: locate the current metrics tab ref
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest snapshot -i --platform ios
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest press <metrics-ref> --platform ios

# metrics: verify the populated final state
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest snapshot -i --platform ios
```

The final Metrics snapshot should include:

- `Tracked Nights` with `89`
- `Data Coverage` with `99%`
- `Average Duration` with `7h 22m`
- `Goal Hit Rate` with `48%`
- the Metrics tab marked selected

For a disposable visual receipt, wait about one second after the final navigation and run:

```bash
mkdir -p .artifacts/eas-simulator
npx --yes eas-cli@latest simulator:exec \
  npx agent-device@latest screenshot \
  .artifacts/eas-simulator/demo-shot.png \
  --platform ios
```

Use the screen recording from the EAS web preview for the edited video. Agent-device does
not provide video recording in this workflow.

## Stop immediately after the take

Use the session ID printed by `simulator:start`:

```bash
npx --yes eas-cli@latest simulator:stop \
  --id <session-id> \
  --non-interactive

npx --yes eas-cli@latest simulator:list \
  --status in-progress \
  --platform ios \
  --limit 20
```

The list must report zero sessions. Delete `.env.eas-simulator` after stopping so no stale
session token survives into the next take.

## Dry-run notes

- Tests passed: 20 suites and 217 tests.
- Lint passed.
- TypeScript passed with `bunx tsc --noEmit`.
- The first normal EAS archive tried to include the entire nine-app comparison repository
  and projected a 524 MB upload. It was interrupted before a build was created. Setting
  `EAS_NO_VCS=1` and `EAS_PROJECT_ROOT` reduced the archive to 2.8 MB and the upload to
  1.3 MB.
- The successful EAS build took about 6 minutes 48 seconds after queueing.
- EAS warned that `ios.infoPlist.ITSAppUsesNonExemptEncryption` is unset. This does not
  block the simulator demo, but it should be set before an App Store Connect submission.
- The final screenshot was complete after a one-second pause. Keep that beat before the
  final hold in the filmed take.
- The tested path uses only two taps and avoids gesture-heavy chart scrubbing.

## Edit recommendation

Use three quick visual beats: populated Home, the Score chart transition, then the Metrics
overview as the hero hold. The Metrics frame has the strongest density and polish, while
the Score tap makes the automation visibly purposeful before the final reveal.
