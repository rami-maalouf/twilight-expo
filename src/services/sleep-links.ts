// ports TwilightApp.swift handleSleepModeLink, handlePendingExternalAction and
// start/stopSleepModeFromExternalTrigger. two entry points feed one queue:
// twilight://sleep/start|stop links (parsed in +native-intent) and android
// home-widget presses (a pending action stored natively by
// modules/twilight-widget-actions). the root layout runs them once mounted
// (swift: consumed on appear / scene activation). no react or react-native imports.
import type { StoreApi } from 'zustand/vanilla';

import type { SleepState, ToggleResult } from '../state/sleep-store';

export type SleepLinkAction = 'start' | 'stop';

export const SLEEP_START_URL = 'twilight://sleep/start';
export const SLEEP_STOP_URL = 'twilight://sleep/stop';

// a widget press older than this is dropped: the app should have opened
// right away, so a late one (the launch failed, the app was force-stopped)
// must not start or end a session by surprise the next time it opens
export const WIDGET_ACTION_MAX_AGE_MS = 2 * 60_000;

export function freshWidgetAction(
  pending: { action: string; at: number } | null,
  nowMs: number = Date.now()
): SleepLinkAction | null {
  if (pending == null) return null;
  if (pending.action !== 'start' && pending.action !== 'stop') return null;
  const age = nowMs - pending.at;
  return age >= 0 && age <= WIDGET_ACTION_MAX_AGE_MS ? pending.action : null;
}

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
let launchLinkQueued = false;
const listeners = new Set<() => void>();

export function queueSleepLinkAction(action: SleepLinkAction): void {
  pending = action;
  for (const listener of listeners) listener();
}

// the link that launched the process can reach js twice: through
// expo-router's initial url (which gives up after 150ms on android and falls
// back to "/") and through the app's own Linking.getInitialURL() fallback.
// it runs once per process.
export function queueLaunchSleepLink(url: string | null | undefined): boolean {
  if (launchLinkQueued || url == null) return false;
  const action = parseSleepLink(url);
  if (action == null) return false;
  launchLinkQueued = true;
  queueSleepLinkAction(action);
  return true;
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
