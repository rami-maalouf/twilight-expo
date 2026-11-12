// runs start/stop requests from outside the dashboard once the root layout is
// up and on every return to the foreground (swift handlePendingExternalAction
// on appear and scene activation): queued twilight://sleep links, the
// pending action an android home-widget press leaves behind, and a session
// notification press the headless task missed
import { useEffect } from 'react';
import { AppState, Linking, Platform } from 'react-native';

import { appSleepStore, resyncAppSleepControls } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';
import { runPendingPresses } from './notification-actions';
import {
  performSleepLinkAction,
  queueLaunchSleepLink,
  subscribeSleepLinkActions,
  takeSleepLinkAction,
} from './sleep-links';
import { showAlert } from '../components/common/app-alert';

function runPending() {
  const action = takeSleepLinkAction();
  if (action == null) return;
  const { message } = performSleepLinkAction(action, useSettings.getState().isOnboarded, appSleepStore);
  if (message) showAlert('Pause...', message);
}

// widget, tile and shortcut presses, and session notification presses the
// headless task did not get to
function queueWidgetActions() {
  runPendingPresses().catch(() => {});
}

export function useExternalSleepActions() {
  useEffect(() => {
    const unsubscribe = subscribeSleepLinkActions(runPending);
    queueWidgetActions();
    runPending();
    // the launch link, in case expo-router's initial url timed out
    Linking.getInitialURL()
      .then(queueLaunchSleepLink)
      .catch(() => {});
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      // the tile and shortcut mirror can change natively behind js (a
      // notification press, a rate-limited shortcut update): republish it
      resyncAppSleepControls();
      queueWidgetActions();
    });
    // android: the quick settings shade can cover the app without pausing
    // it, so a tile press made over the app only shows as regained focus
    const focus = Platform.OS === 'android' ? AppState.addEventListener('focus', queueWidgetActions) : null;
    return () => {
      unsubscribe();
      sub.remove();
      focus?.remove();
    };
  }, []);
}
