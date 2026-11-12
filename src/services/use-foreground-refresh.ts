// platform-neutral foreground refresh (swift: scenePhase .active reloads the
// active session and chart data). sessions can change while the app is in
// the background (a widget link, a date change), so every return to the
// foreground rereads the session store and the settings.
import { useEffect } from 'react';
import { AppState } from 'react-native';

import { appSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';

export function refreshAppState() {
  appSleepStore.getState().refresh();
  useSettings.getState().refresh();
}

export function useForegroundRefresh(onForeground: () => void = refreshAppState) {
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') onForeground();
    });
    return () => sub.remove();
  }, [onForeground]);
}
