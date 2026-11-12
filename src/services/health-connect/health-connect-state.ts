// the single ui source for health connect sync state (docs/health-connect.md 4.3)
import { useStore } from 'zustand';
import { createStore } from 'zustand/vanilla';

import type { HealthSyncSnapshot } from './sync-engine';

export const healthSyncStore = createStore<HealthSyncSnapshot>(() => ({
  status: null,
  enabled: false,
  isSyncing: false,
  lastError: null,
  lastPullResult: null,
  lastSuccessAt: null,
  heldRemoteDeletions: [],
  permissionRequested: false,
}));

export function useHealthSyncState<T>(selector: (state: HealthSyncSnapshot) => T): T {
  return useStore(healthSyncStore, selector);
}
