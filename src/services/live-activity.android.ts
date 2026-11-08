// android twin of live-activity.ts (ports Utils/LiveActivityManager.swift):
// the live activity becomes an ongoing notification
// (modules/twilight-widget-actions/session-notification.ts) with the same
// lifecycle: shown with the session, removed on wake, restored after a
// relaunch, respects the settings toggle, plus the wind-down countdown.
// the native side keeps it ticking and runs its buttons without the app.
import * as Notifications from 'expo-notifications';
import { AppState } from 'react-native';

import {
  activeSessionNotification,
  cancelSessionNotification,
  canPostSessionNotification,
  postSessionNotification,
  type SessionNotificationKind,
  type SessionNotificationSpec,
} from '../../modules/twilight-widget-actions/session-notification';
import { settingsStore } from '../data/app-db';
import type { SleepSession } from '../domain/models';
import {
  isWindDownActivityId,
  SLEEP_ACTIVITY_ID,
  sleepNotificationSpec,
  windDownActivityId,
  windDownNotificationSpec,
} from './live-activity-plan';

function isEnabled(): boolean {
  return settingsStore.get('liveActivityEnabled');
}

function warn(error: unknown) {
  if (__DEV__) console.warn('[session notification]', error);
}

// sleep tracking must never fail because of the notification
function post(spec: SessionNotificationSpec): boolean {
  try {
    return postSessionNotification(spec) === 'posted';
  } catch (error) {
    warn(error);
    return false;
  }
}

function cancel(kind?: SessionNotificationKind): void {
  try {
    cancelSessionNotification(kind);
  } catch (error) {
    warn(error);
  }
}

function shown() {
  try {
    return activeSessionNotification();
  } catch {
    return null;
  }
}

// android 13+ needs POST_NOTIFICATIONS. onboarding asks first; starting a
// session asks again only while android still allows a prompt, and only
// with the app on screen (never from a background start)
async function ensurePermission(): Promise<void> {
  if (canPostSessionNotification() || AppState.currentState !== 'active') return;
  try {
    const current = await Notifications.getPermissionsAsync();
    if (!current.granted && current.canAskAgain) await Notifications.requestPermissionsAsync();
  } catch (error) {
    warn(error);
  }
}

function sleepSpec(session: SleepSession): SessionNotificationSpec {
  return sleepNotificationSpec(
    session,
    settingsStore.get('optimalSleepMinutes'),
    settingsStore.get('optimalWakeMinutes')
  );
}

export async function startSleepActivity(session: SleepSession): Promise<void> {
  if (!isEnabled()) return;
  await ensurePermission();
  settingsStore.set('liveActivityId', post(sleepSpec(session)) ? SLEEP_ACTIVITY_ID : null);
}

export async function endSleepActivity(): Promise<void> {
  cancel();
  settingsStore.set('liveActivityId', null);
}

// the countdown is dismissible; a swiped-away countdown stays away until
// the bedtime changes (the native side remembers which one was dismissed)
export async function startWindDownActivity(bedtimeMs: number): Promise<void> {
  if (!isEnabled()) return;
  const id = windDownActivityId(bedtimeMs);
  if (shown()?.key === id) return;
  settingsStore.set('liveActivityId', post(windDownNotificationSpec(bedtimeMs)) ? id : null);
}

export async function endWindDownActivity(): Promise<void> {
  cancel('winddown');
  if (isWindDownActivityId(settingsStore.get('liveActivityId'))) {
    settingsStore.set('liveActivityId', null);
  }
}

// relaunch and settings reconciliation: active session -> exactly one sleep
// notification with the current goal; no session -> no sleep notification
export async function reconcileLiveActivity(activeSession: SleepSession | null): Promise<void> {
  if (!isEnabled()) {
    await endSleepActivity();
    return;
  }
  const current = shown();
  if (activeSession) {
    settingsStore.set('liveActivityId', post(sleepSpec(activeSession)) ? SLEEP_ACTIVITY_ID : null);
  } else if (current?.kind === 'sleep') {
    await endSleepActivity();
  }
}
