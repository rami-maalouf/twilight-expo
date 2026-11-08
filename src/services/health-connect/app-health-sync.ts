// app-level health connect sync engine singleton and its triggers
// (docs/health-connect.md 1.4, 4.3, 4.4). ios, web and builds without the
// native module get the unsupported adapter, and sync never leaves 'off'.
import { AppState } from 'react-native';

import { demoDataManager, sessionRepo, settingsStore } from '../../data/app-db';
import { connectionState, isConnectionVisible } from '../../domain/health/connection-state';
import { appSleepStore, onLocalSessionsChanged } from '../../state/app-sleep-store';
import { useSettings } from '../../state/settings-state';
import { healthSyncStore } from './health-connect-state';
import { healthConnect, isHealthConnectSupported } from './native-adapter';
import { HealthSyncEngine, type SyncKind } from './sync-engine';
import { connectionInput } from './use-health-connection';

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

// availability and grants change outside twilight (provider update, revoke in
// hc or system settings), so the status is re-read on launch and every
// foreground, also while sync is off (2.7, 2.8)
export function refreshHealthStatus(): void {
  if (!isHealthConnectSupported) return;
  healthSyncEngine.refreshStatus().catch((error) => {
    if (__DEV__) console.log(`[health-connect] status refresh failed: ${String(error)}`);
  });
}

// "Open Health Connect": the per-app page is closed to third-party apps on
// android 14+, so the module falls back to "Data and access" (2.11)
export async function openHealthConnect(): Promise<void> {
  if (!isHealthConnectSupported) return;
  await healthConnect.openPermissionSettings().catch(() => undefined);
}

export async function openHealthConnectUpdate(): Promise<void> {
  if (!isHealthConnectSupported) return;
  await healthConnect.openProviderInstall().catch(() => undefined);
}

// welcome -> health connect step only where health connect is visible and no
// demo is loaded (5.2); reads the status first if launch has not yet
export async function showsHealthConnectOnboarding(): Promise<boolean> {
  if (!isHealthConnectSupported || settingsStore.get('isDemoDataActive')) return false;
  const snapshot = healthSyncStore.getState();
  const status = snapshot.status ?? (await healthSyncEngine.refreshStatus().catch(() => null));
  if (!status) return false;
  const { state } = connectionState(connectionInput({ ...snapshot, status }, false));
  return isConnectionVisible(state);
}

// swift importIfNeeded: onboarding awaits one sync before isOnboarded = true
export async function finishOnboardingHealthSync(enabled: boolean): Promise<void> {
  if (!isHealthConnectSupported || !enabled) return;
  await healthSyncEngine.sync('full');
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
