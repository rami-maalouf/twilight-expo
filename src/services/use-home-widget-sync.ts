// keeps the android home-screen widgets in step with the app (swift:
// StrategyManager reloads widget timelines on every session change).
// publishes on session, history, schedule and theme changes; re-renders on
// foreground, system light/dark changes and about every minute while asleep
// so the elapsed time stays fresh (glance has no ticking timer). runs inside
// ThemeProvider because display mode and palette live there.
import { useEffect, useState } from 'react';
import { AppState, useColorScheme } from 'react-native';

import { useSleepStore } from '../state/app-sleep-store';
import { useSettings } from '../state/settings-state';
import { setWidgetTicking } from '../../modules/twilight-widget-actions';
import { useThemeControls } from '../theme/ThemeProvider';
import { createHomeWidgetPublisher } from './home-widget-publisher';
import { buildHomeWidgetSnapshot } from './home-widget-snapshot';
import { HOME_WIDGETS_SUPPORTED, publishHomeWidgets } from './home-widgets';

const MINUTE_MS = 60_000;

function warn(error: unknown) {
  if (__DEV__) console.warn('[home widgets] publish failed', error);
}

export function useHomeWidgetSync() {
  const activeSession = useSleepStore((s) => s.activeSession);
  const sessions = useSleepStore((s) => s.sessions);
  const optimalSleepMinutes = useSettings((s) => s.optimalSleepMinutes);
  const optimalWakeMinutes = useSettings((s) => s.optimalWakeMinutes);
  const { mode, palette } = useThemeControls();
  const systemScheme = useColorScheme();
  const [publisher] = useState(() => createHomeWidgetPublisher(publishHomeWidgets, warn));

  useEffect(() => {
    if (!HOME_WIDGETS_SUPPORTED) return;
    try {
      publisher.update(
        buildHomeWidgetSnapshot({
          activeSession,
          sessions,
          optimalSleepMinutes,
          optimalWakeMinutes,
          themeMode: mode,
          themePalette: palette,
        })
      );
    } catch (error) {
      warn(error);
    }
  }, [publisher, activeSession, sessions, optimalSleepMinutes, optimalWakeMinutes, mode, palette]);

  // 'system' display mode resolves light/dark when the widget renders
  useEffect(() => {
    if (!HOME_WIDGETS_SUPPORTED) return;
    publisher.refresh();
  }, [publisher, systemScheme]);

  useEffect(() => {
    if (!HOME_WIDGETS_SUPPORTED) return;
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') publisher.refresh();
    });
    return () => sub.remove();
  }, [publisher]);

  // while asleep: a js timer covers the foreground, a native inexact alarm
  // the background (react native timers stop when the app is not visible)
  const sleeping = activeSession != null;
  useEffect(() => {
    if (!HOME_WIDGETS_SUPPORTED) return;
    setWidgetTicking(sleeping);
    if (!sleeping) return;
    const timer = setInterval(() => publisher.refresh(), MINUTE_MS);
    return () => clearInterval(timer);
  }, [publisher, sleeping]);
}
