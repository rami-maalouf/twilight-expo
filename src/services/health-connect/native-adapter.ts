// binds HealthConnectAdapter to the kotlin module on android. ios, web and
// builds without the module get an adapter that reports 'unsupported'.
import { Platform } from 'react-native';

import TwilightHealthConnect, {
  type HcNativeStatus,
  type TwilightHealthConnectNativeModule,
} from '../../../modules/twilight-health-connect';
import {
  type HcStatus,
  type HcWriteResult,
  type HealthConnectAdapter,
  HealthConnectError,
  isHcErrorCode,
} from './adapter';

export const UNSUPPORTED_STATUS: HcStatus = Object.freeze({
  availability: 'unsupported',
  read: false,
  write: false,
  history: false,
  historyFeatureAvailable: false,
  packageName: '',
  sdkInt: 0,
});

// native rejections carry the kotlin error code in `code`; anything else is
// treated as a transient remote failure so the engine retries later
export function toHealthConnectError(error: unknown): HealthConnectError {
  if (error instanceof HealthConnectError) return error;
  const code = (error as { code?: unknown } | null)?.code;
  const message = error instanceof Error ? error.message : String(error);
  return new HealthConnectError(isHcErrorCode(code) ? code : 'E_HC_REMOTE', message);
}

async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    throw toHealthConnectError(error);
  }
}

function toStatus(native: HcNativeStatus): HcStatus {
  return {
    availability: native.availability,
    read: native.read === true,
    write: native.write === true,
    history: native.history === true,
    historyFeatureAvailable: native.historyFeatureAvailable === true,
    packageName: native.packageName,
    sdkInt: native.sdkInt,
  };
}

function toWriteResult(result: HcWriteResult): HcWriteResult {
  if (result.ok) return { ok: true, recordId: result.recordId };
  return {
    ok: false,
    code: isHcErrorCode(result.code) ? result.code : 'E_HC_REMOTE',
    message: result.message,
  };
}

export function createNativeHealthConnectAdapter(
  native: TwilightHealthConnectNativeModule
): HealthConnectAdapter {
  return {
    getStatus: () => call(async () => toStatus(await native.getStatus())),
    getInstallId: () => call(() => native.getInstallId()),
    requestPermissions: (options) =>
      call(async () => toStatus(await native.requestPermissions({ history: options.history }))),
    openPermissionSettings: () => call(() => native.openPermissionSettings()),
    openProviderInstall: () => call(() => native.openProviderInstall()),
    getChangesToken: () => call(() => native.getChangesToken()),
    getChanges: (token) => call(() => native.getChanges(token)),
    readSleep: (query) =>
      call(async () => {
        const page = await native.readSleep(query);
        return { records: page.records, nextPageToken: page.nextPageToken || null };
      }),
    upsertSleep: (writes) =>
      call(async () => {
        if (writes.length === 0) return [];
        const results = await native.upsertSleep(writes);
        if (results.length !== writes.length) {
          throw new HealthConnectError(
            'E_HC_REMOTE',
            `upsertSleep returned ${results.length} results for ${writes.length} writes`
          );
        }
        return results.map(toWriteResult);
      }),
    deleteSleepByClientRecordIds: (ids) =>
      call(async () => {
        if (ids.length > 0) await native.deleteSleepByClientRecordIds(ids);
      }),
  };
}

function unavailable(): Promise<never> {
  return Promise.reject(
    new HealthConnectError('E_HC_UNAVAILABLE', 'Health Connect is not supported on this platform.')
  );
}

// status calls resolve so callers can render "hidden"; everything that would
// touch health data rejects, so a missing platform guard fails loudly
export const unsupportedHealthConnectAdapter: HealthConnectAdapter = {
  getStatus: async () => UNSUPPORTED_STATUS,
  getInstallId: unavailable,
  requestPermissions: async () => UNSUPPORTED_STATUS,
  openPermissionSettings: unavailable,
  openProviderInstall: unavailable,
  getChangesToken: unavailable,
  getChanges: unavailable,
  readSleep: unavailable,
  upsertSleep: unavailable,
  deleteSleepByClientRecordIds: unavailable,
};

export function createHealthConnectAdapter(
  os: string = Platform.OS,
  native: TwilightHealthConnectNativeModule | null = TwilightHealthConnect
): HealthConnectAdapter {
  return os === 'android' && native ? createNativeHealthConnectAdapter(native) : unsupportedHealthConnectAdapter;
}

export const isHealthConnectSupported: boolean = Platform.OS === 'android' && TwilightHealthConnect != null;

export const healthConnect: HealthConnectAdapter = createHealthConnectAdapter();
