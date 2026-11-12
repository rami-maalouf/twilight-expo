// the only seam between twilight and health connect (docs/health-connect.md 4.1).
// the sync engine depends on this interface; tests replace it with a fake.
import type {
  HcChangesPage,
  HcErrorCode,
  HcNativeAvailability,
  HcReadPage,
  HcReadQuery,
  HcRecordingMethod,
  HcSleepRecord,
  HcStage,
  HcWrite,
  HcWriteResult,
} from '../../../modules/twilight-health-connect';

export type {
  HcChangesPage,
  HcErrorCode,
  HcReadPage,
  HcReadQuery,
  HcRecordingMethod,
  HcSleepRecord,
  HcStage,
  HcWrite,
  HcWriteResult,
};

// 'unsupported': ios, web, or a build without the native module. every
// health connect surface is hidden (docs/health-connect.md 2.7).
export type HcAvailability = HcNativeAvailability | 'unsupported';

export interface HcStatus {
  availability: HcAvailability;
  read: boolean;
  write: boolean;
  history: boolean;
  historyFeatureAvailable: boolean;
  packageName: string;
  sdkInt: number;
}

export const HC_ERROR_CODES: readonly HcErrorCode[] = [
  'E_HC_UNAVAILABLE',
  'E_HC_PERMISSION',
  'E_HC_RATE_LIMIT',
  'E_HC_TOKEN',
  'E_HC_INVALID',
  'E_HC_REMOTE',
  'E_HC_IO',
];

export function isHcErrorCode(value: unknown): value is HcErrorCode {
  return typeof value === 'string' && (HC_ERROR_CODES as readonly string[]).includes(value);
}

export class HealthConnectError extends Error {
  readonly code: HcErrorCode;

  constructor(code: HcErrorCode, message: string) {
    super(message);
    this.name = 'HealthConnectError';
    this.code = code;
  }
}

export interface HealthConnectAdapter {
  getStatus(): Promise<HcStatus>;
  // uuid in getNoBackupFilesDir(); changes only on a new install (4.6)
  getInstallId(): Promise<string>;
  requestPermissions(options: { history: boolean }): Promise<HcStatus>;
  openPermissionSettings(): Promise<void>;
  openProviderInstall(): Promise<void>;
  getChangesToken(): Promise<string>;
  getChanges(token: string): Promise<HcChangesPage>;
  // range read; also used by the outbox verify step (2.6) with a narrow window
  readSleep(query: HcReadQuery): Promise<HcReadPage>;
  // one result per write, in input order. valid writes land in one hc
  // transaction: if that call fails, every valid write gets the same code
  upsertSleep(writes: HcWrite[]): Promise<HcWriteResult[]>;
  deleteSleepByClientRecordIds(ids: string[]): Promise<void>;
}
