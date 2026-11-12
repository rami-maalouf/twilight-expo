// export planner and the pure sync decisions around it
// (docs/health-connect.md 2.5, 2.6, 3.3, 3.5). ports: BlockedProfileSession
// markHealthKitSyncPending / prepareForCurrentHealthKitPayload, HealthKitSleepSyncManager.makeSample
import { clientRecordIdFor, isDemoSession } from './ownership';
import {
  AGED_OUT_MS,
  HEALTH_PAYLOAD_MIN_VERSION,
  type HealthProvider,
  type HealthWrite,
  MINIMUM_NIGHT_MS,
  OUTBOX_MAX_BLIND_ATTEMPTS,
} from './types';
import { isValidTimeZone, offsetSecondsAt } from './zones';

// every mutation of an owned session: strictly above the previous version
// and at least the wall clock, so a record an earlier install wrote can never
// silently win (3.3). values stay far below 2^53.
export function nextSyncVersion(current: number, nowMs: number): number {
  return Math.max(Math.floor(current) + 1, Math.floor(nowMs), HEALTH_PAYLOAD_MIN_VERSION);
}

export interface OutboundSessionRow {
  id: string;
  tag: string;
  startMs: number;
  endMs: number | null;
  startZone: string;
  endZone: string | null;
  imported: boolean;
  adopted: boolean;
  provider: HealthProvider | null;
  needsSync: boolean;
  syncVersion: number;
  hcWritten: boolean;
  hcRemoteDeleted: boolean;
  hcErrorCode: string | null;
  hcErrorVersion: number | null;
}

// owned = twilight tracked or logged it; adopted imports stay local (2.5)
export function isOwnedForExport(row: OutboundSessionRow): boolean {
  return !row.imported && !row.adopted && row.provider == null && !isDemoSession(row);
}

export function isEndedValid(row: Pick<OutboundSessionRow, 'startMs' | 'endMs'>): boolean {
  return row.endMs != null && row.endMs - row.startMs >= MINIMUM_NIGHT_MS;
}

export interface PlannedWrite {
  sessionId: string;
  version: number;
  write: HealthWrite;
}

export interface OutboundPlan {
  writes: PlannedWrite[];
  // pending owned sessions without a valid start or end zone (missingZone copy)
  zoneErrors: string[];
  // written earlier and now shorter than 5 min: remove the stale record
  invalidWritten: string[];
}

// health connect rejects a record whose start lies ahead ("start time must not
// be in the future", 2.11). the editor allows any wake day, so such a night
// waits, still pending and without an error, until its start has passed;
// writing it would mark the version invalid and it would never export
export function planOutbound(rows: readonly OutboundSessionRow[], nowMs: number): OutboundPlan {
  const plan: OutboundPlan = { writes: [], zoneErrors: [], invalidWritten: [] };
  for (const row of rows) {
    if (!isOwnedForExport(row) || row.endMs == null) continue;
    if (!isEndedValid(row)) {
      if (row.hcWritten) plan.invalidWritten.push(row.id);
      continue;
    }
    if (!row.needsSync || row.hcRemoteDeleted || row.startMs > nowMs) continue;
    if (row.hcErrorCode != null && row.hcErrorVersion === row.syncVersion) continue;
    const endZone = row.endZone ?? row.startZone;
    if (!isValidTimeZone(row.startZone) || !isValidTimeZone(endZone)) {
      plan.zoneErrors.push(row.id);
      continue;
    }
    plan.writes.push({
      sessionId: row.id,
      version: row.syncVersion,
      write: {
        clientRecordId: clientRecordIdFor(row.id),
        clientRecordVersion: row.syncVersion,
        startMs: row.startMs,
        endMs: row.endMs,
        startZoneId: row.startZone,
        endZoneId: endZone,
        recordingMethod: row.tag === 'Manual Log' ? 'manualEntry' : 'activelyRecorded',
      },
    });
  }
  plan.writes.sort((a, b) => a.write.startMs - b.write.startMs);
  return plan;
}

export interface RemoteOwnRecord {
  version: number;
  startMs: number;
  endMs: number;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
}

export interface LocalOwnState {
  syncVersion: number;
  hcRemoteVersion: number | null;
  startMs: number;
  endMs: number | null;
  startZone: string;
  endZone: string | null;
}

// does the record in health connect carry what the session says?
export function remoteMatchesLocal(local: LocalOwnState, remote: RemoteOwnRecord): boolean {
  if (local.endMs == null) return false;
  const endZone = local.endZone ?? local.startZone;
  return (
    remote.startMs === local.startMs &&
    remote.endMs === local.endMs &&
    (remote.startOffsetSec == null || remote.startOffsetSec === offsetSecondsAt(local.startZone, local.startMs)) &&
    (remote.endOffsetSec == null || remote.endOffsetSec === offsetSecondsAt(endZone, local.endMs))
  );
}

export interface OwnRecordLearning {
  // max rule: a replayed older own change never lowers it
  remoteVersion: number;
  // self-heal: the next write must beat the version health connect holds
  bumpTo: number | null;
}

export function learnOwnRecord(local: LocalOwnState, remote: RemoteOwnRecord, nowMs: number): OwnRecordLearning {
  const remoteVersion = Math.max(local.hcRemoteVersion ?? 0, remote.version);
  const ahead = remote.version > local.syncVersion;
  const sameVersionDiffers = remote.version === local.syncVersion && !remoteMatchesLocal(local, remote);
  return {
    remoteVersion,
    bumpTo: ahead || sameVersionDiffers ? nextSyncVersion(Math.max(remote.version, local.syncVersion), nowMs) : null,
  };
}

// force resync is a repair (2.5): only sessions never written, or whose
// record differs from local, are rewritten
export function needsRepair(local: LocalOwnState & { hcWritten: boolean }, remote: RemoteOwnRecord | undefined): boolean {
  if (!remote) return !local.hcWritten;
  return remote.version !== local.syncVersion || !remoteMatchesLocal(local, remote);
}

// twilight record removed in health connect: never deletes the local night;
// recent ones wait for a user decision, aged-out ones only stop exporting (2.6)
export function classifyRemoteOwnDeletion(endMs: number | null, observedAtMs: number): 'held' | 'agedOut' {
  return endMs != null && observedAtMs - endMs > AGED_OUT_MS ? 'agedOut' : 'held';
}

// a single outbox delete failed with E_HC_REMOTE (2.6 rule 4)
export function outboxFailureAction(input: {
  attempts: number;
  canReadOwn: boolean;
  stillInHealth: boolean;
}): 'drop' | 'retry' {
  if (input.canReadOwn) return input.stillInHealth ? 'retry' : 'drop';
  return input.attempts + 1 >= OUTBOX_MAX_BLIND_ATTEMPTS ? 'drop' : 'retry';
}
