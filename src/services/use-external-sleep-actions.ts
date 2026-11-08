// runs start/stop requests from outside the dashboard once the root layout is
// up and on every return to the foreground (swift handlePendingExternalAction
// on appear and scene activation): queued twilight://sleep links, the
// pending action an android home-widget press leaves behind, and a session
// notification press the headless task missed
import { useEffect } from 'react';
import { Alert, AppState, Linking } from 'react-native';

import { consumePendingWidgetAction } from '../../modules/twilight-widget-actions';
import { appSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';
import { applyNotificationAction } from './notification-actions';
import {
  freshWidgetAction,
  performSleepLinkAction,
  queueLaunchSleepLink,
  queueSleepLinkAction,
  subscribeSleepLinkActions,
  takeSleepLinkAction,
} from './sleep-links';

function runPending() {
  const action = takeSleepLinkAction();
  if (action == null) return;
  const { message } = performSleepLinkAction(action, useSettings.getState().isOnboarded, appSleepStore);
  if (message) Alert.alert('Pause...', message);
}

function queueWidgetAction() {
  const pending = consumePendingWidgetAction();
  // a session notification press the headless task did not get to
  if (pending?.origin === 'notification') {
    applyNotificationAction(pending).catch(() => {});
    return;
  }
  const action = freshWidgetAction(pending);
  if (action) queueSleepLinkAction(action);
}

export function useExternalSleepActions() {
  useEffect(() => {
    const unsubscribe = subscribeSleepLinkActions(runPending);
    queueWidgetAction();
    runPending();
    // the launch link, in case expo-router's initial url timed out
    Linking.getInitialURL()
      .then(queueLaunchSleepLink)
      .catch(() => {});
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') queueWidgetAction();
    });
    return () => {
      unsubscribe();
      sub.remove();
    };
  }, []);
}
