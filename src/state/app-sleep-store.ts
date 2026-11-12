// app-level sleep store singleton + react hook. kept apart from the factory in
// sleep-store.ts so tests can build stores over an in-memory repo without
// touching the native sqlite module.
import { useStore } from 'zustand';

import { sessionRepo } from '../data/app-db';
import { mirrorSleepControls } from '../services/sleep-controls';
import { createSleepStore, type SleepState } from './sleep-store';

const sessionChangeListeners = new Set<() => void>();

// health sync subscribes here without the sleep store importing the engine
export function onLocalSessionsChanged(listener: () => void): () => void {
  sessionChangeListeners.add(listener);
  return () => sessionChangeListeners.delete(listener);
}

export const appSleepStore = createSleepStore(sessionRepo, undefined, () => {
  sessionChangeListeners.forEach((listener) => listener());
});

// the android quick settings tile and launcher shortcuts follow every
// session change, with or without ui (the headless task uses this store too)
const sleepControls = mirrorSleepControls(appSleepStore);

// republishes the mirror unconditionally (on foreground and after a session
// notification press, which changes it natively)
export function resyncAppSleepControls(): void {
  sleepControls.resync();
}

export function useSleepStore<T>(selector: (state: SleepState) => T): T {
  return useStore(appSleepStore, selector);
}
