// app-level health connect sync engine singleton and its triggers
// (docs/health-connect.md 1.4, 4.3, 4.4). ios, web and builds without the
// native module get the unsupported adapter, and sync never leaves 'off'.
import { AppState } from 'react-native';

import { demoDataManager, sessionRepo, settingsStore } from '../../data/app-db';
import { appSleepStore, onLocalSessionsChanged } from '../../state/app-sleep-store';
import { useSettings } from '../../state/settings-state';
import { healthSyncStore } from './health-connect-state';
import { healthConnect, isHealthConnectSupported } from './native-adapter';
import { HealthSyncEngine, type SyncKind } from './sync-engine';

export const healthSyncEngine = new HealthSyncEngine({
  adapter: healthConnect,
  repo: sessionRepo,
  settings: settingsStore,
  isForeground: () => AppState.currentState === 'active',
  onLocalDataChanged: () => appSleepStore.getState().refresh(),
  onSettingsChanged: () => useSettings.getState().refresh(),
  onStateChanged: (snapshot) => healthSyncStore.setState(snapshot),
  log: __DEV__ ? (message) => console.log(message) : undefined,
});

healthSyncStore.setState(healthSyncEngine.snapshot());

export function requestHealthSync(kind: SyncKind): void {
  if (!isHealthConnectSupported) return;
  void healthSyncEngine.sync(kind);
}

// editor save, wake up, log delete -> push (outbound, plus inbound only if
// no full read happened yet)
onLocalSessionsChanged(() => requestHealthSync('push'));

// leaving demo exports the real nights logged meanwhile
demoDataManager.onChange((change) => {
  if (change === 'exited') requestHealthSync('full');
});

// dev builds expose the engine for e2e checks through the metro debugger
if (__DEV__) {
  (globalThis as { __twilightHealthSync?: HealthSyncEngine }).__twilightHealthSync = healthSyncEngine;
}
