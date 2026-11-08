// app-side live activity lifecycle, shared by the ios live activity and the
// android session notification (live-activity.ts / live-activity.android.ts):
// session start/end, relaunch restore, settings changes (the toggle, goal and
// bedtime), lock-screen buttons and the wind-down window
import { useEffect, useRef } from 'react';
import { Alert, AppState, Platform } from 'react-native';
import { addUserInteractionListener } from 'expo-widgets';

import { appSleepStore, useSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';
import { endSleepActivity, startSleepActivity } from './live-activity';
import { START_SLEEP_TARGET, WAKE_UP_TARGET } from './live-activity-targets';
import { refreshWindDown, syncLiveActivityNow } from './live-activity-sync';

function warn(error: unknown) {
  if (__DEV__) console.warn('[live activity]', error);
}

export function useLiveActivitySync() {
  const activeSession = useSleepStore((s) => s.activeSession);
  const liveActivityEnabled = useSettings((s) => s.liveActivityEnabled);
  const optimalSleepMinutes = useSettings((s) => s.optimalSleepMinutes);
  const optimalWakeMinutes = useSettings((s) => s.optimalWakeMinutes);
  const previousSessionId = useRef<string | null>(null);
  const mounted = useRef(false);

  // ios lock-screen buttons -> session mutations (LiveActivityIntent -> js).
  // android notification buttons run natively and through the headless
  // task in session-action-task.ts, even with the app not running
  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    const sub = addUserInteractionListener((event) => {
      const state = appSleepStore.getState();
      if (event.target === WAKE_UP_TARGET && state.activeSession) {
        const result = state.toggleSleep();
        endSleepActivity().catch(warn);
        if (result.joke && AppState.currentState === 'active') {
          Alert.alert('Pause...', result.joke);
        }
      } else if (event.target === START_SLEEP_TARGET && !state.activeSession) {
        const result = state.toggleSleep();
        if (result.started) {
          startSleepActivity(result.started).catch(warn);
        }
      }
    });
    return () => sub.remove();
  }, []);

  // session lifecycle -> activity lifecycle (+ relaunch reconcile on mount)
  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      previousSessionId.current = activeSession?.id ?? null;
      syncLiveActivityNow().catch(warn);
      return;
    }
    const previous = previousSessionId.current;
    previousSessionId.current = activeSession?.id ?? null;
    if (activeSession && activeSession.id !== previous) {
      startSleepActivity(activeSession).catch(warn);
    } else if (!activeSession && previous) {
      endSleepActivity()
        .then(() => refreshWindDown())
        .catch(warn);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSession?.id]);

  // the toggle (off removes, on restores), the goal and the bedtime
  const settingsKey = `${liveActivityEnabled}:${optimalSleepMinutes}:${optimalWakeMinutes}`;
  const lastSettingsKey = useRef(settingsKey);
  useEffect(() => {
    if (lastSettingsKey.current === settingsKey) return;
    lastSettingsKey.current = settingsKey;
    syncLiveActivityNow().catch(warn);
  }, [settingsKey]);

  // the wind-down window opens and closes while the app is away
  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next !== 'active') return;
      appSleepStore.getState().refresh();
      refreshWindDown().catch(warn);
    });
    return () => sub.remove();
  }, []);
}
