// health sync value types (docs/health-connect.md 4.1). pure ts: the native
// wire types in modules/twilight-health-connect are structurally identical.
// ports: HealthKitSleepNightClusterer.swift / HealthKitSleepReconciler.swift snapshots

export const HEALTH_CLIENT_RECORD_PREFIX = 'twilight.sleep-session.';
// swift minimumHealthKitSyncVersion; the floor below the clock rule (3.3)
export const HEALTH_PAYLOAD_MIN_VERSION = 2;
// highest version accepted from a file: far above any clock version (ms),
// far below 2^53, so "+1" always increases and kotlin's Long holds it
export const MAX_HEALTH_SYNC_VERSION = 2 ** 50;
// bump when the exported record shape changes (swift prepareForCurrentHealthKitPayload)
export const HEALTH_PAYLOAD_REVISION = 1;
export const HEALTH_CONNECT_IMPORT_TAG = 'Health Connect';
// swift clusterer maxGapBetweenSamples
export const MAX_GAP_BETWEEN_SAMPLES_MS = 3 * 60 * 60 * 1000;
// swift BlockedProfileSession.minimumDuration
export const MINIMUM_NIGHT_MS = 5 * 60 * 1000;
// remote deletions and vanished imports older than this are "aged out" (2.6)
export const AGED_OUT_MS = 30 * 24 * 60 * 60 * 1000;
export const WRITE_BATCH_SIZE = 50;
export const DELETE_BATCH_SIZE = 50;
// failed outbox runs before a row without an own-read check is dropped (2.6)
export const OUTBOX_MAX_BLIND_ATTEMPTS = 5;
// failed attempts on a row that still exists before the error card shows
export const OUTBOX_ERROR_ATTEMPTS = 3;

export type HealthProvider = 'health_connect' | 'healthkit';

export type HealthRecordingMethod = 'manualEntry' | 'activelyRecorded' | 'automaticallyRecorded' | 'unknown';

export interface HealthStage {
  startMs: number;
  endMs: number;
  type: number;
}

// one SleepSessionRecord as health connect returns it
export interface HealthRecord {
  recordId: string;
  dataOrigin: string;
  clientRecordId: string | null;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
  lastModifiedMs: number;
  recordingMethod: HealthRecordingMethod;
  stages: HealthStage[];
}

// the foreign mirror keeps only what clustering needs (hc_records)
export type MirrorRecord = Omit<HealthRecord, 'clientRecordVersion' | 'recordingMethod'>;

export interface HealthWrite {
  clientRecordId: string;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startZoneId: string;
  endZoneId: string;
  recordingMethod: 'manualEntry' | 'activelyRecorded';
}

export type SampleKind = 'asleep' | 'inBed' | 'awake' | 'other';

// swift HealthKitSleepSampleSnapshot; one per stage (plus the session interval)
export interface SleepSample {
  recordId: string;
  source: string;
  startMs: number;
  endMs: number;
  kind: SampleKind;
  // offsets of the record the sample came from
  startOffsetSec: number | null;
  endOffsetSec: number | null;
}

// swift HealthKitSleepNightCluster
export interface SleepNight {
  nightKey: string;
  source: string;
  startMs: number;
  endMs: number;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
  recordIds: string[];
}

// swift HealthKitLocalSleepSessionSnapshot plus the port's ownership fields
export interface LocalSessionSnapshot {
  id: string;
  startMs: number;
  endMs: number | null;
  imported: boolean;
  adopted: boolean;
  detached: boolean;
  provider: HealthProvider | null;
  nightKey: string | null;
  linkedRecordIds: string[];
  isDemo: boolean;
  // stored zones; compared when an import is updated (optional in pure tests)
  startZone?: string;
  endZone?: string | null;
}

export interface Tombstone {
  nightKey: string;
  deletedAt: number;
  recordIds: string[];
}
