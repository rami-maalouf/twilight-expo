// ports: Twilight/Utils/HealthKitSleepNightClusterer.swift
// health connect mapping: docs/health-connect.md 1.6, 2.1, 2.2
import { isDemoSessionId, isOwnRecord, sessionIdFromClientRecordId } from './ownership';
import {
  type HealthRecord,
  type HealthRecordingMethod,
  MINIMUM_NIGHT_MS,
  type MirrorRecord,
  type SleepNight,
} from './types';
import { wakeDayKey } from './zones';

// SleepSessionRecord.STAGE_TYPE_* (verified against the reference)
export const STAGE_TYPE = {
  UNKNOWN: 0,
  AWAKE: 1,
  SLEEPING: 2,
  OUT_OF_BED: 3,
  LIGHT: 4,
  DEEP: 5,
  REM: 6,
  AWAKE_IN_BED: 7,
} as const;

export function nightKeyFor(source: string, startMs: number, endMs: number, endOffsetSec: number | null, deviceZone: string): string {
  return `${source}|${wakeDayKey(endMs, endOffsetSec, deviceZone)}|${Math.floor(startMs / 1000)}`;
}

// health connect supplies session boundaries directly. stages describe activity
// within one session and separate records can be naps even on the same day.
export function clusterNights(
  records: readonly MirrorRecord[],
  options: { deviceZone: string; ownPackage?: string }
): SleepNight[] {
  return records
    .filter(r => (options.ownPackage == null || !isOwnRecord(r, options.ownPackage))
      && r.endMs - r.startMs >= MINIMUM_NIGHT_MS)
    .map(r => ({
      nightKey: nightKeyFor(r.dataOrigin, r.startMs, r.endMs, r.endOffsetSec, options.deviceZone),
      source: r.dataOrigin,
      startMs: r.startMs,
      endMs: r.endMs,
      startOffsetSec: r.startOffsetSec,
      endOffsetSec: r.endOffsetSec,
      recordIds: [r.recordId],
    }))
    .sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.recordIds[0].localeCompare(b.recordIds[0]));
}

export interface OwnOrphan {
  sessionId: string;
  recordId: string;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
  recordingMethod: HealthRecordingMethod;
}

// swift orphanedTwilightSessions, from a FULL own read only (2.3): own records
// whose session is not local, not in the deletion ledger and not demo
export function orphanedOwnRecords(
  records: readonly HealthRecord[],
  options: { ownPackage: string; existingSessionIds: ReadonlySet<string>; deletedSessionIds: ReadonlySet<string> }
): OwnOrphan[] {
  const orphans = new Map<string, OwnOrphan>();
  for (const record of records) {
    if (!isOwnRecord(record, options.ownPackage)) continue;
    const sessionId = sessionIdFromClientRecordId(record.clientRecordId);
    if (!sessionId || isDemoSessionId(sessionId)) continue;
    if (options.existingSessionIds.has(sessionId) || options.deletedSessionIds.has(sessionId)) continue;
    if (record.endMs - record.startMs < MINIMUM_NIGHT_MS) continue;
    const previous = orphans.get(sessionId);
    if (previous && previous.clientRecordVersion >= record.clientRecordVersion) continue;
    orphans.set(sessionId, {
      sessionId,
      recordId: record.recordId,
      clientRecordVersion: record.clientRecordVersion,
      startMs: record.startMs,
      endMs: record.endMs,
      startOffsetSec: record.startOffsetSec,
      endOffsetSec: record.endOffsetSec,
      recordingMethod: record.recordingMethod,
    });
  }
  return [...orphans.values()].sort((a, b) => a.startMs - b.startMs);
}

// rehydrated orphans take their tag from the recording method (5.6)
export function tagForRecordingMethod(method: HealthRecordingMethod): string {
  return method === 'manualEntry' ? 'Manual Log' : 'Sleep Mode';
}
