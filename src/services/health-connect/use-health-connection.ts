// connection state for the ui (docs/health-connect.md 5.1): the engine
// snapshot + the demo flag through the pure state machine. ios and builds
// without the native module always get 'hidden'.
import { useMemo } from 'react';

import {
  canPullFromHealthConnect,
  connectionState,
  type ConnectionInput,
  type ConnectionView,
} from '../../domain/health/connection-state';
import { useSettings } from '../../state/settings-state';
import { useHealthSyncState } from './health-connect-state';
import { isHealthConnectSupported } from './native-adapter';
import type { HealthSyncSnapshot } from './sync-engine';

export function connectionInput(
  snapshot: Pick<HealthSyncSnapshot, 'status' | 'enabled' | 'permissionRequested'>,
  demoActive: boolean,
  supported: boolean = isHealthConnectSupported
): ConnectionInput {
  const status = snapshot.status;
  return {
    availability: supported ? (status?.availability ?? null) : 'unsupported',
    read: status?.read ?? false,
    write: status?.write ?? false,
    history: status?.history ?? false,
    historyFeatureAvailable: status?.historyFeatureAvailable ?? false,
    permissionRequested: snapshot.permissionRequested,
    enabled: snapshot.enabled,
    demoActive,
  };
}

export function useHealthConnection(): ConnectionView & { input: ConnectionInput; canPull: boolean } {
  const status = useHealthSyncState((s) => s.status);
  const enabled = useHealthSyncState((s) => s.enabled);
  const permissionRequested = useHealthSyncState((s) => s.permissionRequested);
  const demoActive = useSettings((s) => s.isDemoDataActive);
  return useMemo(() => {
    const input = connectionInput({ status, enabled, permissionRequested }, demoActive);
    return { ...connectionState(input), input, canPull: canPullFromHealthConnect(input) };
  }, [status, enabled, permissionRequested, demoActive]);
}
