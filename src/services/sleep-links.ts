// ports TwilightApp.swift handleSleepModeLink + start/stopSleepModeFromExternalTrigger:
// twilight://sleep/start and twilight://sleep/stop, used by the android home
// widgets (and any other surface that opens the app to start or stop sleep).
// links are parsed in +native-intent, queued here, and run once the root
// layout is mounted (swift: SharedData pending external action consumed on
// appear / scene activation). no react or react-native imports.
import type { StoreApi } from 'zustand/vanilla';

import type { SleepState, ToggleResult } from '../state/sleep-store';

export type SleepLinkAction = 'start' | 'stop';

export const SLEEP_START_URL = 'twilight://sleep/start';
export const SLEEP_STOP_URL = 'twilight://sleep/stop';

// accepts full urls (any scheme, so dev-client prefixes work) and bare paths
export function parseSleepLink(url: string): SleepLinkAction | null {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, '');
  const path = withoutScheme.split(/[?#]/)[0];
  const parts = path.split('/').filter((part) => part.length > 0);
  if (parts.length < 2 || parts[0].toLowerCase() !== 'sleep') return null;
  const action = parts[1].toLowerCase();
  return action === 'start' || action === 'stop' ? action : null;
}

// swift errorMessage copy, shown in the "Pause..." alert
export const SLEEP_LINK_MESSAGES = {
  notOnboarded: 'Set up your sleep profile before using Sleep Mode controls.',
  alreadyActive: 'Sleep mode is already active.',
  notActive: 'Sleep mode is not active.',
} as const;

export interface SleepLinkOutcome {
  // alert body for the "Pause..." alert; null when nothing needs saying
  message: string | null;
  result: ToggleResult | null;
}

// runs one action through the same store path as the dashboard button;
// idempotent: start while sleeping and stop while awake only explain
export function performSleepLinkAction(
  action: SleepLinkAction,
  isOnboarded: boolean,
  store: StoreApi<SleepState>,
  nowMs: number = Date.now()
): SleepLinkOutcome {
  if (!isOnboarded) return { message: SLEEP_LINK_MESSAGES.notOnboarded, result: null };
  // swift reloads the active session before deciding (another surface may
  // have changed it while the app was in the background)
  store.getState().refresh();
  const sleeping = store.getState().activeSession != null;
  if (action === 'start' && sleeping) return { message: SLEEP_LINK_MESSAGES.alreadyActive, result: null };
  if (action === 'stop' && !sleeping) return { message: SLEEP_LINK_MESSAGES.notActive, result: null };
  const result = store.getState().toggleSleep(nowMs);
  return { message: result.joke, result };
}

// one-slot pending action, like SharedData.pendingExternalAction: a newer
// link replaces an older one that was never consumed
let pending: SleepLinkAction | null = null;
const listeners = new Set<() => void>();

export function queueSleepLinkAction(action: SleepLinkAction): void {
  pending = action;
  for (const listener of listeners) listener();
}

export function takeSleepLinkAction(): SleepLinkAction | null {
  const action = pending;
  pending = null;
  return action;
}

export function subscribeSleepLinkActions(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
