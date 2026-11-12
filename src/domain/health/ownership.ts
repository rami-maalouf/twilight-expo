// who owns a record or a session (docs/health-connect.md 1.2, 2.2, 4.4)
// ports: BlockedProfileSession.healthKitSyncIdentifier, HealthKitSleepNightClusterer.twilightSessionID
import { DEMO_SESSION_ID_PREFIX } from '../../demo/demo-mode';
import { HEALTH_CLIENT_RECORD_PREFIX, type HealthRecord, type MirrorRecord } from './types';

export const DEMO_SESSION_TAG = 'Demo Log';

export function clientRecordIdFor(sessionId: string): string {
  return `${HEALTH_CLIENT_RECORD_PREFIX}${sessionId}`;
}

export function sessionIdFromClientRecordId(clientRecordId: string | null): string | null {
  if (!clientRecordId?.startsWith(HEALTH_CLIENT_RECORD_PREFIX)) return null;
  const id = clientRecordId.slice(HEALTH_CLIENT_RECORD_PREFIX.length);
  return id.length > 0 ? id : null;
}

// own = written by this package, and only that. a twilight-prefixed record
// from another package is foreign: twilight could never update or delete it
// (2.2, deliberate difference from swift's prefix rule)
export function isOwnRecord(record: Pick<HealthRecord | MirrorRecord, 'dataOrigin'>, ownPackage: string): boolean {
  return record.dataOrigin === ownPackage;
}

export function isDemoSessionId(id: string): boolean {
  return id.startsWith(DEMO_SESSION_ID_PREFIX);
}

export function isDemoSession(session: { id: string; tag?: string }): boolean {
  return isDemoSessionId(session.id) || session.tag === DEMO_SESSION_TAG;
}
