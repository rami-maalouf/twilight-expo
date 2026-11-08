// export planner, version rule and sync decisions (docs/health-connect.md 2.5, 2.6, 3.3, 7.1)
import {
  classifyRemoteOwnDeletion,
  learnOwnRecord,
  needsRepair,
  nextSyncVersion,
  outboxFailureAction,
  planOutbound,
  type OutboundSessionRow,
} from '../outbound';
import { buildPullResult, READ_WINDOW_HINT } from '../pull-result';
import { offsetSecondsAt, wakeDayKey, zoneForOffset } from '../zones';

const H = 3600_000;
const DAY = 24 * H;
const T0 = Date.UTC(2026, 10, 1, 23, 0);

function row(id: string, opts: Partial<OutboundSessionRow> = {}): OutboundSessionRow {
  return {
    id,
    tag: 'Manual Log',
    startMs: T0,
    endMs: T0 + 8 * H,
    startZone: 'Europe/Paris',
    endZone: 'Europe/Paris',
    imported: false,
    adopted: false,
    provider: null,
    needsSync: true,
    syncVersion: 1_000,
    hcWritten: false,
    hcRemoteDeleted: false,
    hcErrorCode: null,
    hcErrorVersion: null,
    ...opts,
  };
}

describe('planOutbound', () => {
  test('exports pending owned nights with the swift client record id and recording method', () => {
    const plan = planOutbound([row('a'), row('b', { tag: 'Sleep Mode', startMs: T0 + DAY, endMs: T0 + DAY + 7 * H })]);
    expect(plan.writes.map((w) => w.write)).toEqual([
      {
        clientRecordId: 'twilight.sleep-session.a',
        clientRecordVersion: 1_000,
        startMs: T0,
        endMs: T0 + 8 * H,
        startZoneId: 'Europe/Paris',
        endZoneId: 'Europe/Paris',
        recordingMethod: 'manualEntry',
      },
      expect.objectContaining({ clientRecordId: 'twilight.sleep-session.b', recordingMethod: 'activelyRecorded' }),
    ]);
  });

  test.each<[string, Partial<OutboundSessionRow>]>([
    ['active', { endMs: null }],
    ['invalid (< 5 min)', { endMs: T0 + 4 * 60_000 }],
    ['imported', { imported: true, provider: 'health_connect' }],
    ['adopted', { adopted: true, provider: 'health_connect' }],
    ['remote-deleted', { hcRemoteDeleted: true }],
    ['poisoned at this version', { hcErrorCode: 'invalid', hcErrorVersion: 1_000 }],
    ['healthkit provider', { provider: 'healthkit' }],
    ['demo tag', { tag: 'Demo Log' }],
    ['not pending', { needsSync: false }],
  ])('skips %s', (_name, over) => {
    expect(planOutbound([row('x', over)]).writes).toHaveLength(0);
  });

  test('skips the demo id prefix', () => {
    expect(planOutbound([row('rami-demo-session-1')]).writes).toHaveLength(0);
  });

  test('a poison marker from an older version does not block the new version', () => {
    expect(planOutbound([row('x', { hcErrorCode: 'invalid', hcErrorVersion: 999 })]).writes).toHaveLength(1);
  });

  test('an invalid zone is an error, not a write', () => {
    const plan = planOutbound([row('x', { startZone: 'Mars/Olympus' })]);
    expect(plan.writes).toHaveLength(0);
    expect(plan.zoneErrors).toEqual(['x']);
  });

  test('a missing end zone falls back to the start zone (swift endTimeZone)', () => {
    expect(planOutbound([row('x', { endZone: null })]).writes[0].write.endZoneId).toBe('Europe/Paris');
  });

  test('a written session that became invalid goes to the outbox', () => {
    const plan = planOutbound([row('x', { endMs: T0 + 60_000, hcWritten: true }), row('y', { endMs: T0 + 60_000 })]);
    expect(plan.invalidWritten).toEqual(['x']);
  });
});

describe('version rule (3.3)', () => {
  test('clock value on mutation', () => {
    expect(nextSyncVersion(2, T0)).toBe(T0);
  });

  test('+1 when the clock goes backwards', () => {
    expect(nextSyncVersion(T0, T0 - DAY)).toBe(T0 + 1);
  });

  const local = { syncVersion: T0, hcRemoteVersion: T0, startMs: T0, endMs: T0 + 8 * H, startZone: 'UTC', endZone: 'UTC' };
  const remote = { version: T0, startMs: T0, endMs: T0 + 8 * H, startOffsetSec: 0, endOffsetSec: 0 };

  test('self-heal when the remote version is higher', () => {
    expect(learnOwnRecord(local, { ...remote, version: T0 + 50 }, T0 - DAY)).toEqual({ remoteVersion: T0 + 50, bumpTo: T0 + 51 });
  });

  test('self-heal when the same version carries other content', () => {
    expect(learnOwnRecord(local, { ...remote, endMs: T0 + 9 * H }, T0 + H).bumpTo).toBe(T0 + H);
  });

  test('a replayed older own change does not lower hc_remote_version and does not bump', () => {
    expect(learnOwnRecord(local, { ...remote, version: T0 - 5, endMs: T0 + 2 * H }, T0)).toEqual({ remoteVersion: T0, bumpTo: null });
  });

  test('matching record: nothing to heal', () => {
    expect(learnOwnRecord(local, remote, T0).bumpTo).toBeNull();
  });

  test('repair: never written -> yes; written and matching -> no; differs -> yes; written but absent -> no', () => {
    expect(needsRepair({ ...local, hcWritten: false }, undefined)).toBe(true);
    expect(needsRepair({ ...local, hcWritten: true }, remote)).toBe(false);
    expect(needsRepair({ ...local, hcWritten: true }, { ...remote, startOffsetSec: 3600 })).toBe(true);
    expect(needsRepair({ ...local, hcWritten: true }, undefined)).toBe(false);
  });
});

describe('remote deletion policy and outbox decisions (2.6)', () => {
  test('recent -> held; older than 30 days -> aged out', () => {
    expect(classifyRemoteOwnDeletion(T0, T0 + DAY)).toBe('held');
    expect(classifyRemoteOwnDeletion(T0, T0 + 31 * DAY)).toBe('agedOut');
  });

  test('a failed single delete: own read shows it absent -> drop; present -> retry', () => {
    expect(outboxFailureAction({ attempts: 0, canReadOwn: true, stillInHealth: false })).toBe('drop');
    expect(outboxFailureAction({ attempts: 9, canReadOwn: true, stillInHealth: true })).toBe('retry');
  });

  test('without an own read the row is dropped after 5 failed runs', () => {
    expect(outboxFailureAction({ attempts: 3, canReadOwn: false, stillInHealth: true })).toBe('retry');
    expect(outboxFailureAction({ attempts: 4, canReadOwn: false, stillInHealth: true })).toBe('drop');
  });
});

describe('zones (3.5)', () => {
  const summer = Date.UTC(2026, 6, 1, 12);
  const winter = Date.UTC(2026, 0, 15, 12);

  test('device zone wins when it matches', () => {
    expect(zoneForOffset(7200, summer, 'Europe/Paris')).toBe('Europe/Paris');
  });

  test('whole hours use Etc/GMT with posix sign inversion', () => {
    expect(zoneForOffset(7200, winter, 'Europe/Paris')).toBe('Etc/GMT-2');
    expect(zoneForOffset(-18000, summer, 'Europe/Paris')).toBe('Etc/GMT+5');
    expect(zoneForOffset(0, summer, 'Europe/Paris')).toBe('Etc/GMT');
  });

  test('+05:30 -> Asia/Kolkata with the device in Europe/Paris', () => {
    expect(zoneForOffset(19800, summer, 'Europe/Paris')).toBe('Asia/Kolkata');
  });

  test('-02:30 in newfoundland summer, -03:30 in winter', () => {
    expect(zoneForOffset(-9000, summer, 'Europe/Paris')).toBe('America/St_Johns');
    expect(zoneForOffset(-12600, winter, 'Europe/Paris')).toBe('America/St_Johns');
  });

  test('unknown offset and null offset fall back to the device zone', () => {
    expect(zoneForOffset(1234, summer, 'Europe/Paris')).toBe('Europe/Paris');
    expect(zoneForOffset(null, summer, 'Europe/Paris')).toBe('Europe/Paris');
  });

  test('dst night: start and end offsets differ and map independently', () => {
    // europe falls back on 2026-10-25 at 01:00 utc
    const start = Date.UTC(2026, 9, 24, 21);
    const end = Date.UTC(2026, 9, 25, 5);
    expect(offsetSecondsAt('Europe/Paris', start)).toBe(7200);
    expect(offsetSecondsAt('Europe/Paris', end)).toBe(3600);
    expect(zoneForOffset(7200, start, 'Europe/Paris')).toBe('Europe/Paris');
    expect(zoneForOffset(3600, end, 'Europe/Paris')).toBe('Europe/Paris');
  });

  test('offset of an unknown zone is null', () => {
    expect(offsetSecondsAt('Not/AZone', summer)).toBeNull();
  });

  test('wake day uses the offset, not the device', () => {
    expect(wakeDayKey(Date.UTC(2026, 7, 10, 23, 0), 3600, 'America/Los_Angeles')).toBe('2026-08-11');
  });
});

describe('pull result messages (5.5)', () => {
  const base = { recordCount: 4, nightCount: 2, inserted: 0, updated: 0, rehydrated: 0, historyGranted: true };

  test('imported', () => {
    expect(buildPullResult({ ...base, inserted: 1, rehydrated: 1 }).message).toBe('Imported 2 night(s) from Health Connect (4 session(s)).');
  });

  test('updated only (fixes swift "Imported 0 night(s)")', () => {
    expect(buildPullResult({ ...base, updated: 3 }).message).toBe('Updated 3 night(s) from Health Connect (4 session(s)).');
  });

  test('nothing new', () => {
    expect(buildPullResult(base).message).toBe(
      'Found 4 Health Connect sleep session(s) in 2 night(s), but Twilight already has matching nights or they overlapped local sleep.'
    );
  });

  test('empty, with the read-window hint only when history is missing', () => {
    expect(buildPullResult({ ...base, recordCount: 0 }).message).not.toContain(READ_WINDOW_HINT);
    expect(buildPullResult({ ...base, recordCount: 0, historyGranted: false }).message).toContain(READ_WINDOW_HINT);
  });
});
