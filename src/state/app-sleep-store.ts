// app-level sleep store singleton + react hook. kept apart from the factory in
// sleep-store.ts so tests can build stores over an in-memory repo without
// touching the native sqlite module.
import { useStore } from 'zustand';

import { sessionRepo } from '../data/app-db';
import { mirrorSleepControls } from '../services/sleep-controls';
import { createSleepStore, type SleepState } from './sleep-store';

export const appSleepStore = createSleepStore(sessionRepo);

// the android quick settings tile and launcher shortcuts follow every
// session change, with or without ui (the headless task uses this store too)
mirrorSleepControls(appSleepStore);

export function useSleepStore<T>(selector: (state: SleepState) => T): T {
  return useStore(appSleepStore, selector);
}
