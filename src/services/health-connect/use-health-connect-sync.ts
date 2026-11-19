// launch and foreground triggers (swift syncPendingSleepSessions on appear and
// scenePhase .active). android only; ios never touches health connect.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { refreshHealthStatus, requestHealthSync } from './app-health-sync';
import { healthSyncStore } from './health-connect-state';
import { isHealthConnectSupported } from './native-adapter';

export function useHealthConnectSync(): void {
  useEffect(() => {
    if (!isHealthConnectSupported) return;
    refreshHealthStatus();
    requestHealthSync('full');
    const interval = setInterval(() => {
      const { enabled, status, isSyncing } = healthSyncStore.getState();
      if (AppState.currentState === 'active' && enabled && status?.read && !isSyncing) {
        requestHealthSync('full');
      }
    }, 30_000);
    const subscription = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      refreshHealthStatus();
      requestHealthSync('full');
    });
    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, []);
}
