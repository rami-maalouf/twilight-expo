// runs queued twilight://sleep/start|stop links once the root layout is up
// (swift handlePendingExternalAction on appear) and whenever a new one arrives
import { useEffect } from 'react';
import { Alert } from 'react-native';

import { appSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';
import { performSleepLinkAction, subscribeSleepLinkActions, takeSleepLinkAction } from './sleep-links';

function runPending() {
  const action = takeSleepLinkAction();
  if (action == null) return;
  const { message } = performSleepLinkAction(action, useSettings.getState().isOnboarded, appSleepStore);
  if (message) Alert.alert('Pause...', message);
}

export function useSleepLinkActions() {
  useEffect(() => {
    runPending();
    return subscribeSleepLinkActions(runPending);
  }, []);
}
