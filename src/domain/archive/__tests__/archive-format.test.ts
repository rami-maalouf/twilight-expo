// archive decode, validation and encoding (docs/health-connect.md 6.1-6.3)
// includes the ported twilightTests/DataArchiveTombstoneTests.swift cases
import {
  ARCHIVE_TYPE,
  ArchiveError,
  buildArchivePayload,
  decodeArchive,
  encodeArchive,
  type ArchivedSession,
  type ArchivePayload,
} from '../archive-format';
import { MAX_HEALTH_SYNC_VERSION } from '../../health/types';

const T0 = Date.UTC(2026, 10, 1, 22, 0);
const H = 3600_000;

function session(id: string, overrides: Partial<ArchivedSession> = {}): ArchivedSession {
  return {
    id,
    tag: 'Manual Log',
    startTime: T0,
    endTime: T0 + 8 * H,
    startTimeZone: 'Europe/Paris',
    endTimeZone: 'Europe/Paris',
    createdAt: T0 + 9 * H,
    updatedAt: T0 + 9 * H,
    needsHealthSync: false,
    healthSyncVersion: 3,
    imported: false,
    adopted: false,
    provider: null,
    nightKey: null,
    sourceId: null,
    ...overrides,
  };
}

function payload(overrides: Partial<Parameters<typeof buildArchivePayload>[0]> = {}): ArchivePayload {
  return buildArchivePayload({
    sessions: [session('a')],
    tombstones: [],
    settings: {
      isOnboarded: true,
      optimalSleepMinutes: 23 * 60,
      optimalWakeMinutes: 7 * 60,
      windDownReminderEnabled: false,
      healthSyncEnabled: true,
    },
    appearance: { themeMode: 'dark', colorPalette: 'twilight' },
    nowMs: T0 + 10 * H,
    timeZoneIdentifier: 'Europe/Paris',
    appVersion: '1.0.0',
    platform: 'android',
    ...overrides,
  });
}

// mutate the encoded json, then decode it
function decodeWith(mutate: (json: Record<string, any>) => void, base = payload()) {
  const json = JSON.parse(encodeArchive(base));
  mutate(json);
  return decodeArchive(JSON.stringify(json));
}

function expectError(fn: () => unknown, message: string) {
  try {
    fn();
  } catch (error) {
    expect(error).toBeInstanceOf(ArchiveError);
    expect((error as Error).message).toBe(message);
    return;
  }
  throw new Error('expected an ArchiveError');
}

function swiftArchive(overrides: Record<string, unknown> = {}) {
  const profile = 'B1C2D3E4-0000-0000-0000-000000000001';
  return {
    metadata: {
      archiveType: 'twilight-full-backup',
      schemaVersion: 2,
      exportedAt: '2024-08-12T00:03:20Z',
      timeZoneIdentifier: 'America/New_York',
      appVersion: '0.10',
    },
    sleepSettings: {
      isOnboarded: true,
      optimalSleepMinutes: 1380,
      optimalWakeMinutes: 420,
      sleepProfileId: profile,
      windDownReminderEnabled: true,
      healthSyncEnabled: true,
    },
    appearance: { themeMode: 'Sunset', colorPalette: 'default' },
    profiles: [{ id: profile, name: 'Sleep' }],
    sessions: [
      {
        id: 'owned',
        tag: 'Sleep Mode',
        blockedProfileId: profile,
        startTime: '2024-08-11T03:00:00Z',
        endTime: '2024-08-11T11:00:00Z',
        breakStartTime: '2024-08-11T05:00:00Z',
        breakEndTime: '2024-08-11T05:10:00Z',
        startTimeZoneIdentifier: null,
        endTimeZoneIdentifier: 'America/New_York',
        forceStarted: false,
        needsHealthKitSync: true,
        healthKitSyncVersion: 4,
      },
      {
        id: 'imported',
        tag: 'Apple Health',
        blockedProfileId: profile,
        startTime: '2024-08-10T03:00:00Z',
        endTime: '2024-08-10T11:00:00Z',
        forceStarted: false,
        needsHealthKitSync: false,
        healthKitSyncVersion: 2,
        isHealthKitImported: true,
        healthKitExternalNightKey: '2024-08-10',
        healthKitSourceBundleIdentifier: 'com.apple.health',
      },
      {
        id: 'adopted',
        tag: 'Apple Health',
        blockedProfileId: profile,
        startTime: '2024-08-09T03:00:00Z',
        endTime: '2024-08-09T11:00:00Z',
        forceStarted: false,
        needsHealthKitSync: false,
        healthKitSyncVersion: 2,
        isHealthKitImported: false,
        healthKitExternalNightKey: '2024-08-09',
      },
      {
        id: 'other-profile',
        tag: 'Focus',
        blockedProfileId: 'B1C2D3E4-0000-0000-0000-000000000002',
        startTime: '2024-08-08T15:00:00Z',
        endTime: '2024-08-08T16:00:00Z',
        forceStarted: false,
        needsHealthKitSync: false,
        healthKitSyncVersion: 2,
      },
    ],
    sharedState: { activeSharedSession: null, completedScheduleSessions: [] },
    healthKitSleepTombstones: [{ nightKey: '2026-08-10', deletedAt: '2024-08-12T00:00:00Z' }],
    ...overrides,
  };
}

describe('DataArchiveTombstoneTests (ported)', () => {
  test('testHealthKitSleepTombstonesRoundTrip', () => {
    const deletedAt = 1_723_420_800_000;
    const decoded = decodeArchive(
      encodeArchive(payload({ tombstones: [{ nightKey: '2026-08-10', deletedAt, recordIds: ['r2', 'r1'] }] }))
    );
    expect(decoded.tombstones).toHaveLength(1);
    expect(decoded.tombstones[0].nightKey).toBe('2026-08-10');
    expect(Math.abs(decoded.tombstones[0].deletedAt - deletedAt)).toBeLessThanOrEqual(1000);
    expect(decoded.tombstones[0].recordIds).toEqual(['r1', 'r2']);
    // the swift archive type round trips its tombstones the same way
    expect(decodeArchive(JSON.stringify(swiftArchive())).tombstones).toEqual([
      { nightKey: '2026-08-10', deletedAt: Date.parse('2024-08-12T00:00:00Z'), recordIds: [] },
    ]);
  });

  test('testMissingHealthKitSleepTombstonesKeyDecodesAsEmpty', () => {
    expect(decodeWith((json) => delete json.healthSleepTombstones).tombstones).toEqual([]);
    const swift = swiftArchive();
    delete (swift as Record<string, unknown>).healthKitSleepTombstones;
    expect(decodeArchive(JSON.stringify(swift)).tombstones).toEqual([]);
  });
});

describe('archive encoding', () => {
  test('pretty printed, sorted keys, iso dates with ms, own archive type', () => {
    const text = encodeArchive(payload());
    expect(text.startsWith('{\n  "appearance": {')).toBe(true);
    const json = JSON.parse(text);
    expect(Object.keys(json)).toEqual(['appearance', 'healthSleepTombstones', 'metadata', 'sessions', 'sleepSettings']);
    expect(Object.keys(json.sessions[0])).toEqual([...Object.keys(json.sessions[0])].sort());
    expect(json.metadata).toEqual({
      appVersion: '1.0.0',
      archiveType: ARCHIVE_TYPE,
      exportedAt: '2026-11-02T08:00:00.000Z',
      platform: 'android',
      schemaVersion: 1,
      timeZoneIdentifier: 'Europe/Paris',
    });
    expect(json.sessions[0].startTime).toBe('2026-11-01T22:00:00.000Z');
  });

  test('round trip keeps every session field', () => {
    const imported = session('imp', {
      tag: 'Health Connect',
      imported: true,
      provider: 'health_connect',
      nightKey: 'com.watch|2026-11-02|1',
      sourceId: 'com.watch',
    });
    const adopted = session('adp', { adopted: true, provider: 'health_connect', nightKey: 'k' });
    const active = session('act', { endTime: null, endTimeZone: null, needsHealthSync: true });
    const decoded = decodeArchive(encodeArchive(payload({ sessions: [session('a'), imported, adopted, active] })));
    expect(decoded.source).toBe('port');
    expect(decoded.sessions).toEqual([session('a'), imported, adopted, active]);
    expect(decoded.settings).toEqual({
      isOnboarded: true,
      optimalSleepMinutes: 1380,
      optimalWakeMinutes: 420,
      windDownReminderEnabled: false,
    });
    expect(decoded.appearance).toEqual({ themeMode: 'dark', colorPalette: 'twilight' });
  });

  test('missing optional keys decode to defaults', () => {
    const decoded = decodeWith((json) => {
      const s = json.sessions[0];
      for (const key of ['isHealthAdopted', 'healthProvider', 'healthExternalNightKey', 'healthSourceIdentifier', 'needsHealthSync', 'healthSyncVersion', 'createdAt', 'updatedAt']) {
        delete s[key];
      }
      delete json.metadata.appVersion;
      delete json.sleepSettings.healthSyncEnabled;
    });
    expect(decoded.appVersion).toBeNull();
    expect(decoded.sessions[0]).toMatchObject({
      adopted: false,
      provider: null,
      nightKey: null,
      sourceId: null,
      needsHealthSync: true,
      healthSyncVersion: 0,
      createdAt: T0,
      updatedAt: T0 + 8 * H,
    });
  });
});

describe('archive validation', () => {
  test('not a backup', () => {
    const message = 'This file is not a Twilight backup.';
    expectError(() => decodeArchive('not json'), message);
    expectError(() => decodeArchive('[]'), message);
    expectError(() => decodeArchive('{"sessions": []}'), message);
    expectError(() => decodeWith((json) => (json.metadata.archiveType = 'something-else')), message);
    expectError(() => decodeWith((json) => delete json.sessions), message);
    expectError(() => decodeWith((json) => delete json.metadata.exportedAt), message);
  });

  test('unsupported schema versions', () => {
    expectError(
      () => decodeWith((json) => (json.metadata.schemaVersion = 2)),
      'This backup uses schema version 2, which this app version cannot import.'
    );
    expectError(
      () => decodeWith((json) => (json.metadata.schemaVersion = 0)),
      'This backup uses schema version 0, which this app version cannot import.'
    );
    expectError(
      () => decodeArchive(JSON.stringify(swiftArchive({ metadata: { ...swiftArchive().metadata, schemaVersion: 3 } }))),
      'This backup uses schema version 3, which this app version cannot import.'
    );
  });

  test('duplicate session ids', () => {
    expectError(
      () => decodeArchive(encodeArchive(payload({ sessions: [session('a'), session('a', { startTime: T0 - H })] }))),
      'The backup contains duplicate session IDs (a).'
    );
  });

  test('invalid sessions', () => {
    const invalid = (s: ArchivedSession) => () => decodeArchive(encodeArchive(payload({ sessions: [s] })));
    const message = 'This backup contains an invalid sleep session (x).';
    expectError(invalid(session('x', { endTime: T0 })), message);
    expectError(invalid(session('x', { startTimeZone: 'Mars/Olympus' })), message);
    expectError(invalid(session('x', { endTimeZone: 'Nope/Nope' })), message);
    expectError(invalid(session('x', { imported: true, adopted: true, provider: 'health_connect' })), message);
    expectError(invalid(session('x', { imported: true })), message);
    expectError(() => decodeWith((json) => (json.sessions[0].healthProvider = 'fitbit')), 'This backup contains an invalid sleep session (a).');
    expectError(() => decodeWith((json) => (json.sessions[0].startTime = 'yesterday')), 'This backup contains an invalid sleep session (a).');
    expectError(() => decodeWith((json) => delete json.sessions[0].tag), 'This backup contains an invalid sleep session (a).');
    expectError(() => decodeWith((json) => (json.sessions = [42])), 'This backup contains an invalid sleep session (#1).');
    // sync versions above the safe bound would stop "+1" from increasing (and overflow kotlin's Long)
    expectError(() => decodeWith((json) => (json.sessions[0].healthSyncVersion = 1e300)), 'This backup contains an invalid sleep session (a).');
    expectError(() => decodeWith((json) => (json.sessions[0].healthSyncVersion = Number.MAX_SAFE_INTEGER)), 'This backup contains an invalid sleep session (a).');
    expectError(() => decodeWith((json) => (json.sessions[0].healthSyncVersion = -1)), 'This backup contains an invalid sleep session (a).');
    expect(decodeWith((json) => (json.sessions[0].healthSyncVersion = MAX_HEALTH_SYNC_VERSION)).sessions[0].healthSyncVersion).toBe(MAX_HEALTH_SYNC_VERSION);
  });

  test('at most one active session', () => {
    const active = (id: string) => session(id, { endTime: null, endTimeZone: null });
    expectError(
      () => decodeArchive(encodeArchive(payload({ sessions: [active('a'), active('b')] }))),
      'This backup contains more than one active sleep session.'
    );
  });

  test('settings and appearance values', () => {
    expectError(
      () => decodeWith((json) => (json.sleepSettings.optimalSleepMinutes = 1440)),
      'This backup contains invalid settings (optimalSleepMinutes).'
    );
    expectError(
      () => decodeWith((json) => (json.sleepSettings.optimalWakeMinutes = -1)),
      'This backup contains invalid settings (optimalWakeMinutes).'
    );
    expectError(() => decodeWith((json) => (json.sleepSettings.isOnboarded = 'yes')), 'This backup contains invalid settings (isOnboarded).');
    expectError(() => decodeWith((json) => (json.appearance.themeMode = 'Sunset')), 'This backup contains invalid settings (themeMode).');
    expectError(() => decodeWith((json) => (json.appearance.colorPalette = 'pink')), 'This backup contains invalid settings (colorPalette).');
  });
});

describe('swift archive import (6.3)', () => {
  test('v2: sleep profile sessions only, healthkit fields mapped, breaks ignored', () => {
    const decoded = decodeArchive(JSON.stringify(swiftArchive()));
    expect(decoded.source).toBe('swift');
    expect(decoded.appVersion).toBe('0.10');
    expect(decoded.sessions.map((s) => s.id)).toEqual(['owned', 'imported', 'adopted']);
    const [owned, imported, adopted] = decoded.sessions;
    expect(owned).toEqual({
      id: 'owned',
      tag: 'Sleep Mode',
      startTime: Date.parse('2024-08-11T03:00:00Z'),
      endTime: Date.parse('2024-08-11T11:00:00Z'),
      // a missing zone falls back to the archive zone
      startTimeZone: 'America/New_York',
      endTimeZone: 'America/New_York',
      createdAt: Date.parse('2024-08-11T03:00:00Z'),
      updatedAt: Date.parse('2024-08-11T11:00:00Z'),
      needsHealthSync: true,
      healthSyncVersion: 4,
      imported: false,
      adopted: false,
      provider: null,
      nightKey: null,
      sourceId: null,
    });
    expect(imported).toMatchObject({ imported: true, adopted: false, provider: 'healthkit', nightKey: '2024-08-10', sourceId: 'com.apple.health', needsHealthSync: false });
    expect(adopted).toMatchObject({ imported: false, adopted: true, provider: 'healthkit', nightKey: '2024-08-09', needsHealthSync: false });
  });

  test('theme raw values map, unknown values keep the current setting', () => {
    expect(decodeArchive(JSON.stringify(swiftArchive())).appearance).toEqual({ themeMode: 'light', colorPalette: null });
    const nightSky = swiftArchive({ appearance: { themeMode: 'Night Sky', colorPalette: 'Amethyst' } });
    expect(decodeArchive(JSON.stringify(nightSky)).appearance).toEqual({ themeMode: 'dark', colorPalette: 'amethyst' });
  });

  test('v1 without a sleep profile imports every session and no tombstones', () => {
    const base = swiftArchive();
    const v1 = {
      ...base,
      metadata: { ...base.metadata, schemaVersion: 1 },
      sleepSettings: { ...base.sleepSettings, sleepProfileId: null },
    };
    delete (v1 as Record<string, unknown>).healthKitSleepTombstones;
    const decoded = decodeArchive(JSON.stringify(v1));
    expect(decoded.sessions).toHaveLength(4);
    expect(decoded.tombstones).toEqual([]);
  });
});
