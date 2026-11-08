---
description: Argent screenshot cost discipline - keep vision tokens low
alwaysApply: true
---

When using Argent (or any mobile simulator screenshots) for UI validation:

1. Prefer `describe` / `debugger-component-tree` over screenshots.
2. Default screenshot scale is **0.2** (`ARGENT_SCREENSHOT_SCALE`). Never pass `scale: 1` for routine checks.
3. Full-res only for visual diffs: `scale: 1` + `includeImageInContext: false`.
4. Prefer `run-sequence`; wait with `await-ui-element` / `await-screen-idle` - do not poll screenshots.
5. Do not record screen video unless the question requires motion.
6. Auto-screenshots are disabled globally - leave that flag on; take explicit screenshots only when needed.
