// foreground refresh: rereads sessions changed behind the app's back on every
// return to 'active', on every platform
import { renderHook } from '@testing-library/react-native';
import { AppState, type AppStateStatus } from 'react-native';

jest.mock('@/data/app-db', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { memoryDb } = require('../../../tests/helpers/memory-db');
  const { migrate } = require('@/data/db');
  const { SessionRepo } = require('@/data/session-repo');
  const { SettingsStore } = require('@/data/settings-store');
  /* eslint-enable @typescript-eslint/no-require-imports */
  const db = memoryDb();
  migrate(db);
  const map = new Map<string, string>();
  return {
    sessionRepo: new SessionRepo(db),
    settingsStore: new SettingsStore({
      getItemSync: (key: string) => map.get(key) ?? null,
      setItemSync: (key: string, value: string) => {
        map.set(key, value);
      },
    }),
  };
});

/* eslint-disable import/first */
import { sessionRepo, settingsStore } from '@/data/app-db';
import { appSleepStore } from '@/state/app-sleep-store';
import { useSettings } from '@/state/settings-state';
import { useForegroundRefresh } from '../use-foreground-refresh';
/* eslint-enable import/first */

function captureAppStateListener() {
  const listeners: ((state: AppStateStatus) => void)[] = [];
  const remove = jest.fn();
  // the react-native jest preset mocks AppState.addEventListener with a jest.fn
  (AppState.addEventListener as jest.Mock).mockImplementation(
    (_type: string, listener: (state: AppStateStatus) => void) => {
      listeners.push(listener);
      return { remove };
    }
  );
  return { emit: (state: AppStateStatus) => listeners.forEach((l) => l(state)), remove };
}

afterEach(() => (AppState.addEventListener as jest.Mock).mockReset());

test('returning to the foreground reloads sessions and settings', async () => {
  const appState = captureAppStateListener();
  const { unmount } = await renderHook(() => useForegroundRefresh());

  // a widget link started a session and the schedule changed while backgrounded
  sessionRepo.startSession('Sleep Mode', 'America/Denver', Date.UTC(2025, 0, 15, 5));
  settingsStore.set('optimalWakeMinutes', 6 * 60);
  expect(appSleepStore.getState().activeSession).toBeNull();

  appState.emit('background');
  expect(appSleepStore.getState().activeSession).toBeNull();

  appState.emit('active');
  expect(appSleepStore.getState().activeSession).not.toBeNull();
  expect(useSettings.getState().optimalWakeMinutes).toBe(6 * 60);

  await unmount();
  expect(appState.remove).toHaveBeenCalled();
});

test('a custom foreground handler runs only on active', async () => {
  const appState = captureAppStateListener();
  const onForeground = jest.fn();
  await renderHook(() => useForegroundRefresh(onForeground));
  appState.emit('inactive');
  appState.emit('background');
  expect(onForeground).not.toHaveBeenCalled();
  appState.emit('active');
  expect(onForeground).toHaveBeenCalledTimes(1);
});
