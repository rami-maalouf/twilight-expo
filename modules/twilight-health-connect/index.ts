// typed access to the android-only TwilightHealthConnect native module.
// the wire types match docs/health-connect.md 4.1. the module is null on ios,
// on web and when the native code is not in the build; use the adapter in
// src/services/health-connect instead of this file directly.
import { requireOptionalNativeModule } from 'expo';

export type HcNativeAvailability = 'available' | 'providerUpdateRequired' | 'unavailable';

export interface HcNativeStatus {
  availability: HcNativeAvailability;
  read: boolean;
  write: boolean;
  history: boolean;
  historyFeatureAvailable: boolean;
  packageName: string;
  sdkInt: number;
}

export interface HcStage {
  startMs: number;
  endMs: number;
  type: number;
}

export type HcRecordingMethod = 'manualEntry' | 'activelyRecorded' | 'automaticallyRecorded' | 'unknown';

export interface HcSleepRecord {
  recordId: string;
  dataOrigin: string;
  clientRecordId: string | null;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startOffsetSec: number | null;
  endOffsetSec: number | null;
  lastModifiedMs: number;
  recordingMethod: HcRecordingMethod;
  stages: HcStage[];
}

export interface HcChangesPage {
  upserts: HcSleepRecord[];
  deletedRecordIds: string[];
  nextToken: string;
  hasMore: boolean;
  tokenExpired: boolean;
}

export interface HcWrite {
  clientRecordId: string;
  clientRecordVersion: number;
  startMs: number;
  endMs: number;
  startZoneId: string;
  endZoneId: string;
  recordingMethod: 'manualEntry' | 'activelyRecorded';
}

export type HcErrorCode =
  | 'E_HC_UNAVAILABLE'
  | 'E_HC_PERMISSION'
  | 'E_HC_RATE_LIMIT'
  | 'E_HC_TOKEN'
  | 'E_HC_INVALID'
  | 'E_HC_REMOTE'
  | 'E_HC_IO';

export type HcWriteResult = { ok: true; recordId: string } | { ok: false; code: HcErrorCode; message: string };

export interface HcReadQuery {
  origin: 'own' | 'all';
  // null reads from the start of the store (hc trims ranges it may not read)
  startMs: number | null;
  endMs: number;
  pageToken: string | null;
}

export interface HcReadPage {
  records: HcSleepRecord[];
  nextPageToken: string | null;
}

export interface TwilightHealthConnectNativeModule {
  getStatus(): Promise<HcNativeStatus>;
  getInstallId(): Promise<string>;
  requestPermissions(options: { history: boolean }): Promise<HcNativeStatus>;
  openPermissionSettings(): Promise<void>;
  openProviderInstall(): Promise<void>;
  getChangesToken(): Promise<string>;
  getChanges(token: string): Promise<HcChangesPage>;
  readSleep(query: HcReadQuery): Promise<HcReadPage>;
  upsertSleep(writes: HcWrite[]): Promise<HcWriteResult[]>;
  deleteSleepByClientRecordIds(ids: string[]): Promise<void>;
}

export default requireOptionalNativeModule<TwilightHealthConnectNativeModule>('TwilightHealthConnect');
