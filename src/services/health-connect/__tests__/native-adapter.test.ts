import type { TwilightHealthConnectNativeModule } from '../../../../modules/twilight-health-connect';
import { HealthConnectError, isHcErrorCode } from '../adapter';
import {
  createHealthConnectAdapter,
  createNativeHealthConnectAdapter,
  healthConnect,
  isHealthConnectSupported,
  toHealthConnectError,
  UNSUPPORTED_STATUS,
  unsupportedHealthConnectAdapter,
} from '../native-adapter';

const nativeStatus = {
  availability: 'available' as const,
  read: true,
  write: false,
  history: true,
  historyFeatureAvailable: true,
  packageName: 'com.rami.twilight.port',
  sdkInt: 36,
};

function fakeNative(overrides: Partial<TwilightHealthConnectNativeModule> = {}): TwilightHealthConnectNativeModule {
  return {
    getStatus: jest.fn(async () => nativeStatus),
    getInstallId: jest.fn(async () => 'install-1'),
    requestPermissions: jest.fn(async () => nativeStatus),
    openPermissionSettings: jest.fn(async () => undefined),
    openProviderInstall: jest.fn(async () => undefined),
    getChangesToken: jest.fn(async () => 'token-1'),
    getChanges: jest.fn(async () => ({
      upserts: [],
      deletedRecordIds: [],
      nextToken: 'token-2',
      hasMore: false,
      tokenExpired: false,
    })),
    readSleep: jest.fn(async () => ({ records: [], nextPageToken: null })),
    upsertSleep: jest.fn(async () => []),
    deleteSleepByClientRecordIds: jest.fn(async () => undefined),
    ...overrides,
  };
}

function nativeError(code: string, message: string): Error {
  return Object.assign(new Error(message), { code });
}

const write = {
  clientRecordId: 'twilight.sleep-session.a',
  clientRecordVersion: 1_762_000_000_000,
  startMs: 1_000,
  endMs: 2_000,
  startZoneId: 'Europe/Paris',
  endZoneId: 'Europe/Paris',
  recordingMethod: 'manualEntry' as const,
};

describe('platform selection', () => {
  it('uses the unsupported adapter on ios even when a module object exists', () => {
    expect(createHealthConnectAdapter('ios', fakeNative())).toBe(unsupportedHealthConnectAdapter);
  });

  it('uses the unsupported adapter on web and when the android module is missing', () => {
    expect(createHealthConnectAdapter('web', fakeNative())).toBe(unsupportedHealthConnectAdapter);
    expect(createHealthConnectAdapter('android', null)).toBe(unsupportedHealthConnectAdapter);
  });

  it('binds the native module on android', async () => {
    const native = fakeNative();
    const adapter = createHealthConnectAdapter('android', native);
    await expect(adapter.getInstallId()).resolves.toBe('install-1');
    expect(native.getInstallId).toHaveBeenCalledTimes(1);
  });

  it('is unsupported in the jest (ios) environment, where no native module exists', async () => {
    expect(isHealthConnectSupported).toBe(false);
    await expect(healthConnect.getStatus()).resolves.toEqual(UNSUPPORTED_STATUS);
  });
});

describe('unsupported adapter', () => {
  it('reports unsupported status without throwing', async () => {
    await expect(unsupportedHealthConnectAdapter.getStatus()).resolves.toEqual({
      availability: 'unsupported',
      read: false,
      write: false,
      history: false,
      historyFeatureAvailable: false,
      packageName: '',
      sdkInt: 0,
    });
    await expect(unsupportedHealthConnectAdapter.requestPermissions({ history: true })).resolves.toEqual(
      UNSUPPORTED_STATUS
    );
  });

  it('rejects every data and navigation call with E_HC_UNAVAILABLE', async () => {
    const calls = [
      () => unsupportedHealthConnectAdapter.getInstallId(),
      () => unsupportedHealthConnectAdapter.openPermissionSettings(),
      () => unsupportedHealthConnectAdapter.openProviderInstall(),
      () => unsupportedHealthConnectAdapter.getChangesToken(),
      () => unsupportedHealthConnectAdapter.getChanges('t'),
      () => unsupportedHealthConnectAdapter.readSleep({ origin: 'all', startMs: null, endMs: 1, pageToken: null }),
      () => unsupportedHealthConnectAdapter.upsertSleep([write]),
      () => unsupportedHealthConnectAdapter.deleteSleepByClientRecordIds(['twilight.sleep-session.a']),
    ];
    for (const run of calls) {
      await expect(run()).rejects.toMatchObject({ name: 'HealthConnectError', code: 'E_HC_UNAVAILABLE' });
    }
  });
});

describe('error mapping', () => {
  it('keeps known native codes and messages', async () => {
    const adapter = createNativeHealthConnectAdapter(
      fakeNative({
        getChanges: jest.fn(async () => {
          throw nativeError('E_HC_TOKEN', 'IllegalArgumentException: bad token');
        }),
      })
    );
    const error = await adapter.getChanges('bogus').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(HealthConnectError);
    expect(error).toMatchObject({ code: 'E_HC_TOKEN', message: 'IllegalArgumentException: bad token' });
  });

  it('maps unknown codes and non-error values to E_HC_REMOTE', () => {
    expect(toHealthConnectError(nativeError('ERR_UNEXPECTED', 'boom')).code).toBe('E_HC_REMOTE');
    expect(toHealthConnectError('plain string')).toMatchObject({ code: 'E_HC_REMOTE', message: 'plain string' });
    expect(toHealthConnectError(null).code).toBe('E_HC_REMOTE');
  });

  it('passes a HealthConnectError through unchanged', () => {
    const original = new HealthConnectError('E_HC_RATE_LIMIT', 'quota');
    expect(toHealthConnectError(original)).toBe(original);
  });

  it('recognizes exactly the adapter error codes', () => {
    expect(isHcErrorCode('E_HC_IO')).toBe(true);
    expect(isHcErrorCode('E_HC_NOPE')).toBe(false);
    expect(isHcErrorCode(42)).toBe(false);
  });
});

describe('native adapter', () => {
  it('normalizes status booleans', async () => {
    const adapter = createNativeHealthConnectAdapter(
      fakeNative({
        getStatus: jest.fn(async () => ({ ...nativeStatus, write: undefined as unknown as boolean })),
      })
    );
    await expect(adapter.getStatus()).resolves.toMatchObject({ read: true, write: false, history: true });
  });

  it('forwards only the history option to the permission request', async () => {
    const native = fakeNative();
    const adapter = createNativeHealthConnectAdapter(native);
    await adapter.requestPermissions({ history: true, extra: 1 } as unknown as { history: boolean });
    expect(native.requestPermissions).toHaveBeenCalledWith({ history: true });
  });

  it('turns an empty page token into null', async () => {
    const adapter = createNativeHealthConnectAdapter(
      fakeNative({ readSleep: jest.fn(async () => ({ records: [], nextPageToken: '' })) })
    );
    await expect(
      adapter.readSleep({ origin: 'own', startMs: null, endMs: 10, pageToken: null })
    ).resolves.toEqual({ records: [], nextPageToken: null });
  });

  it('skips the native call for empty writes and deletes', async () => {
    const native = fakeNative();
    const adapter = createNativeHealthConnectAdapter(native);
    await expect(adapter.upsertSleep([])).resolves.toEqual([]);
    await adapter.deleteSleepByClientRecordIds([]);
    expect(native.upsertSleep).not.toHaveBeenCalled();
    expect(native.deleteSleepByClientRecordIds).not.toHaveBeenCalled();
  });

  it('returns per-write results in order and maps unknown failure codes', async () => {
    const adapter = createNativeHealthConnectAdapter(
      fakeNative({
        upsertSleep: jest.fn(async () => [
          { ok: true as const, recordId: 'r1' },
          { ok: false as const, code: 'E_HC_INVALID' as const, message: 'end must be after start' },
          { ok: false as const, code: 'E_SOMETHING' as never, message: 'odd' },
        ]),
      })
    );
    await expect(adapter.upsertSleep([write, write, write])).resolves.toEqual([
      { ok: true, recordId: 'r1' },
      { ok: false, code: 'E_HC_INVALID', message: 'end must be after start' },
      { ok: false, code: 'E_HC_REMOTE', message: 'odd' },
    ]);
  });

  it('rejects when the native result count does not match the writes', async () => {
    const adapter = createNativeHealthConnectAdapter(
      fakeNative({ upsertSleep: jest.fn(async () => [{ ok: true as const, recordId: 'r1' }]) })
    );
    await expect(adapter.upsertSleep([write, write])).rejects.toMatchObject({ code: 'E_HC_REMOTE' });
  });
});
