// ports: Twilight/Utils/HealthKitSleepNightClusterer.swift
// health connect mapping: docs/health-connect.md 1.6, 2.1, 2.2
import { isDemoSessionId, isOwnRecord, sessionIdFromClientRecordId } from './ownership';
import {
  type HealthRecord,
  type HealthRecordingMethod,
  MAX_GAP_BETWEEN_SAMPLES_MS,
  MINIMUM_NIGHT_MS,
  type MirrorRecord,
  type SampleKind,
  type SleepNight,
  type SleepSample,
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

const AWAKE_STAGES = new Set<number>([STAGE_TYPE.AWAKE, STAGE_TYPE.OUT_OF_BED, STAGE_TYPE.AWAKE_IN_BED]);

// unknown and future stage values count as sleep (swift: unknown -> asleep)
export function stageKind(type: number): SampleKind {
  return AWAKE_STAGES.has(type) ? 'awake' : 'asleep';
}

// record-to-sample rule (2.1): asleep stages plus an in-bed sample over the
// session; no stages = asleep over the session; awake-only = in bed
export function recordToSamples(record: MirrorRecord): SleepSample[] {
  if (record.endMs <= record.startMs) return [];
  const base = {
    recordId: record.recordId,
    source: record.dataOrigin,
    startOffsetSec: record.startOffsetSec,
    endOffsetSec: record.endOffsetSec,
  };
  const session = (kind: SampleKind): SleepSample => ({
    ...base,
    startMs: record.startMs,
    endMs: record.endMs,
    kind,
  });
  if (record.stages.length === 0) return [session('asleep')];
  const asleep = record.stages.filter((s) => s.endMs > s.startMs && stageKind(s.type) === 'asleep');
  if (asleep.length === 0) return [session('inBed')];
  return [
    ...asleep.map((s) => ({ ...base, startMs: s.startMs, endMs: s.endMs, kind: 'asleep' as const })),
    session('inBed'),
  ];
}

export function nightKeyFor(source: string, startMs: number, endMs: number, endOffsetSec: number | null, deviceZone: string): string {
  return `${source}|${wakeDayKey(endMs, endOffsetSec, deviceZone)}|${Math.floor(startMs / 1000)}`;
}

function makeNight(samples: SleepSample[], source: string, deviceZone: string): SleepNight | null {
  if (samples.length === 0) return null;
  const asleep = samples.filter((s) => s.kind === 'asleep');
  const envelope = asleep.length > 0 ? asleep : samples.filter((s) => s.kind === 'inBed');
  if (envelope.length === 0) return null;

  const first = envelope.reduce((a, b) => (b.startMs < a.startMs ? b : a));
  const last = envelope.reduce((a, b) => (b.endMs > a.endMs ? b : a));
  if (last.endMs - first.startMs < MINIMUM_NIGHT_MS) return null;

  // swift: first non-nil zone of the envelope, else of any sample
  const startOffsetSec =
    first.startOffsetSec ??
    envelope.find((s) => s.startOffsetSec != null)?.startOffsetSec ??
    samples.find((s) => s.startOffsetSec != null)?.startOffsetSec ??
    null;
  const endOffsetSec =
    last.endOffsetSec ??
    envelope.find((s) => s.endOffsetSec != null)?.endOffsetSec ??
    samples.find((s) => s.endOffsetSec != null)?.endOffsetSec ??
    null;

  return {
    nightKey: nightKeyFor(source, first.startMs, last.endMs, endOffsetSec, deviceZone),
    source,
    startMs: first.startMs,
    endMs: last.endMs,
    startOffsetSec,
    endOffsetSec,
    recordIds: [...new Set(samples.map((s) => s.recordId))].sort(),
  };
}

// foreign records only, grouped by source, split when the next sample starts
// more than 3 h after the batch's latest end. swift measured from the last
// sample's end; with hc's in-bed sample spanning its own stages the latest
// end is the correct reference (docs/health-connect.md 1.6 note)
export function clusterNights(
  records: readonly MirrorRecord[],
  options: { deviceZone: string; ownPackage?: string }
): SleepNight[] {
  const samples = records
    .filter((r) => options.ownPackage == null || !isOwnRecord(r, options.ownPackage))
    .flatMap(recordToSamples)
    .filter((s) => (s.kind === 'asleep' || s.kind === 'inBed') && s.endMs > s.startMs);

  const bySource = new Map<string, SleepSample[]>();
  for (const sample of samples) {
    const list = bySource.get(sample.source) ?? [];
    list.push(sample);
    bySource.set(sample.source, list);
  }

  const nights: SleepNight[] = [];
  for (const [source, list] of bySource) {
    const sorted = [...list].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs);
    let batch: SleepSample[] = [];
    let batchEnd = -Infinity;
    for (const sample of sorted) {
      if (batch.length > 0 && sample.startMs - batchEnd > MAX_GAP_BETWEEN_SAMPLES_MS) {
        const night = makeNight(batch, source, options.deviceZone);
        if (night) nights.push(night);
        batch = [];
        batchEnd = -Infinity;
      }
      batch.push(sample);
      batchEnd = Math.max(batchEnd, sample.endMs);
    }
    const night = makeNight(batch, source, options.deviceZone);
    if (night) nights.push(night);
  }

  return nights.sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.nightKey.localeCompare(b.nightKey));
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
