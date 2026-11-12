// applies android session notification presses (wake up / start sleep) that
// the native receiver recorded with their press time. runs in the headless
// task right after the press (app swiped away or screen locked) and, as a
// fallback, when the app next opens or returns to the foreground.
import { AppState } from 'react-native';

import {
  consumePendingWidgetAction,
  setWidgetTicking,
  type PendingWidgetAction,
} from '../../modules/twilight-widget-actions';
import { settingsStore } from '../data/app-db';
import { appSleepStore, resyncAppSleepControls } from '../state/app-sleep-store';
import { buildHomeWidgetSnapshot } from './home-widget-snapshot';
import { HOME_WIDGETS_SUPPORTED, publishHomeWidgets } from './home-widgets';
import { syncLiveActivityNow } from './live-activity-sync';
import { drainPendingPresses, planNotificationAction, queueSleepLinkAction } from './sleep-links';
import { showAlert } from '../components/common/app-alert';
import { deviceClock } from '../utils/locale-format';

function warn(error: unknown) {
  if (__DEV__) console.warn('[notification action]', error);
}

// the home widgets follow the session even with no ui mounted to run
// useHomeWidgetSync (its HomeWidgetSync re-publishes once the app is up)
function publishWidgetsNow(): void {
  if (!HOME_WIDGETS_SUPPORTED) return;
  try {
    const { activeSession, sessions } = appSleepStore.getState();
    publishHomeWidgets({
      ...buildHomeWidgetSnapshot({
        activeSession,
        sessions,
        optimalSleepMinutes: settingsStore.get('optimalSleepMinutes'),
        optimalWakeMinutes: settingsStore.get('optimalWakeMinutes'),
        themeMode: settingsStore.get('themeMode'),
        themePalette: settingsStore.get('themePalette'),
        clock: deviceClock(),
      }),
      renderKey: Date.now(),
    });
    setWidgetTicking(activeSession != null);
  } catch (error) {
    warn(error);
  }
}

// true when the press changed the session. a press that no longer applies
// still resyncs, because the native side already removed the notification
export async function applyNotificationAction(
  pending: PendingWidgetAction,
  nowMs: number = Date.now()
): Promise<boolean> {
  const store = appSleepStore;
  store.getState().refresh();
  const plan = settingsStore.get('isOnboarded')
    ? planNotificationAction(pending, store.getState(), nowMs)
    : null;
  const result = plan ? store.getState().toggleSleep(plan.atMs) : null;
  // the receiver already flipped the tile and shortcut mirror natively; a
  // press that did not apply leaves the store unchanged, so republish
  resyncAppSleepControls();
  await syncLiveActivityNow().catch(warn);
  if (result) publishWidgetsNow();
  // like the ios live activity button: the short-sleep joke only shows when
  // the app is on screen
  if (result?.joke && AppState.currentState === 'active') showAlert('Pause...', result.joke);
  return result != null;
}

// every pending press, oldest first: notification presses apply at their
// press time, a widget, tile or shortcut press is queued for the ui, which
// runs it once mounted (use-external-sleep-actions). the headless task and
// the ui's launch / foreground checks both run this
export function runPendingPresses(): Promise<void> {
  return drainPendingPresses(consumePendingWidgetAction, {
    applyNotification: (pending) => applyNotificationAction(pending).catch(warn),
    queueWidget: queueSleepLinkAction,
  });
}
