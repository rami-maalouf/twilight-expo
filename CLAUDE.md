@AGENTS.md

## Argent / Screenshot Cost Rules

To keep vision-token cost low during mobile UI work:
1. **Prefer trees over pixels:** Use `describe` or `debugger-component-tree` to verify state. Call `screenshot` only when the check is strictly visual (spacing, color, clipping, typography).
2. **Default scale is 0.2** via `ARGENT_SCREENSHOT_SCALE`. Do **not** pass `scale: 1` (or any scale above 0.2) for routine UI inspection or readability.
3. **Full-res only for diffs:** For `screenshot-diff` baselines/current captures, use `scale: 1` with `includeImageInContext: false` so the PNG is on disk but not loaded into model context.
4. **Batch interactions:** Prefer `run-sequence` for multi-step device actions. Wait with `await-ui-element` / `await-screen-idle` - never poll with repeated screenshots.
5. **Video is expensive and rarely needed:** Do not start `screen-recording-*` unless the question requires motion (animation, gesture path, timing/jank). Prefer a still + tree.
6. **Auto-screenshots are disabled globally** (`disable-auto-screenshot`). Do not re-enable. Take an explicit `screenshot` only when you need an image in context.
