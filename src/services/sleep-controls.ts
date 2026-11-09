// mirrors the session into android's sleep controls outside the app: the
// quick settings tile and the launcher shortcuts (swift reloads the
// SleepModeControlWidget on every session change). wired once to the app
// store, so every surface that starts or ends a session updates them: the
// dashboard, sleep links, widgets, the tile and shortcuts themselves (they
// run through the app), and the session notification's headless task.
// a no-op without the native module (ios, web, jest).
import type { StoreApi } from 'zustand/vanilla';

import { setSleepControlsState } from '../../modules/twilight-widget-actions';
import type { SleepState } from '../state/sleep-store';

export function mirrorSleepControls(
  store: StoreApi<SleepState>,
  publish: (sleepingSinceMs: number | null) => void = setSleepControlsState
): () => void {
  // undefined until the first publish: every process publishes once, which
  // also repairs a mirror that missed a change while js was not running
  let published: number | null | undefined;
  const sync = (state: SleepState) => {
    const sleepingSinceMs = state.activeSession?.startTime ?? null;
    if (sleepingSinceMs === published) return;
    published = sleepingSinceMs;
    try {
      publish(sleepingSinceMs);
    } catch {
      // the controls catch up on the next change
    }
  };
  sync(store.getState());
  return store.subscribe(sync);
}
