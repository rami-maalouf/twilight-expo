// launch and foreground triggers (swift syncPendingSleepSessions on appear and
// scenePhase .active). android only; ios never touches health connect.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { requestHealthSync } from './app-health-sync';
import { isHealthConnectSupported } from './native-adapter';

export function useHealthConnectSync(): void {
  useEffect(() => {
    if (!isHealthConnectSupported) return;
    requestHealthSync('full');
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') requestHealthSync('full');
    });
    return () => subscription.remove();
  }, []);
}
