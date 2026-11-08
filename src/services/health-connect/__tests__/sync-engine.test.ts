// engine tests over in-memory sqlite + FakeHealthConnect (docs/health-connect.md 4.5, 7.1)
import { FakeHealthConnect, OWN_PACKAGE, type FakeOptions } from '../../../../tests/helpers/fake-health-connect';
import { memoryDb } from '../../../../tests/helpers/memory-db';
import { migrate } from '../../../data/db';
import { SessionRepo } from '../../../data/session-repo';
import { SettingsStore, type KeyValueStorage } from '../../../data/settings-store';
import { createDemoSleepSessions, DEMO_SESSION_ID_PREFIX } from '../../../demo/demo-mode';
import { HealthConnectError } from '../adapter';
import { HealthSyncEngine } from '../sync-engine';

const H = 3600_000;
const DAY = 24 * H;
// 23:00 in paris (cest)
const T0 = Date.UTC(2026, 8, 1, 21, 0);
const WATCH = 'com.watch.sleep';
const OTHER = 'com.other.sleep';

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return { getItemSync: (k) => map.get(k) ?? null, setItemSync: (k, v) => void map.set(k, v) };
}

function setup(options: FakeOptions = { equalVersionReplaces: true }) {
  const db = memoryDb();
  migrate(db, T0 - DAY);
  const repo = new SessionRepo(db);
  const hc = new FakeHealthConnect(options);
  const settings = new SettingsStore(memoryKv());
  settings.set('healthSyncEnabled', true);
  const clock = { now: T0 + 30 * DAY };
  hc.clock = () => clock.now;
  const env = { foreground: true };
  const engine = new HealthSyncEngine({
    adapter: hc,
    repo,
    settings,
    isForeground: () => env.foreground,
    now: () => clock.now,
    deviceZone: () => 'Europe/Paris',
  });
  // a night on day d (23:00 -> 06:00 paris)
  const at = (d: number, h = 0) => T0 + d * DAY + h * H;
  const logNight = (d: number) =>
    repo.createManualLog({ startTime: at(d), endTime: at(d, 7), startTimeZone: 'Europe/Paris', endTimeZone: 'Europe/Paris', nowMs: clock.now });
  const editNight = (id: string, d: number, endH = 8) =>
    repo.updateSession(id, { startTime: at(d), endTime: at(d, endH), startTimeZone: 'Europe/Paris', endTimeZone: 'Europe/Paris', nowMs: clock.now });
  const foreign = (d: number, origin = WATCH, extra: { cid?: string; startH?: number; endH?: number } = {}) =>
    hc.foreignUpsert({ origin, cid: extra.cid ?? `${origin}-${d}`, startMs: at(d, extra.startH ?? 0), endMs: at(d, extra.endH ?? 7) });
  const sessions = () => repo.listValidSessions();
  const imports = () => sessions().filter((s) => s.health?.imported);
  return { db, repo, hc, settings, clock, env, engine, at, logNight, editNight, foreign, sessions, imports };
}

describe.each([
  ['android 16 (equal version replaces, missing delete resolves)', { equalVersionReplaces: true }],
  ['docs mode (equal version ignored, missing delete throws)', { equalVersionReplaces: false, deleteMissingThrows: true, badTokenThrows: true }],
])('sync engine, %s', (_name, options: FakeOptions) => {
  test('enable -> full read imports foreign nights, exports owned nights, no echo', async () => {
    const t = setup(options);
    t.settings.set('healthSyncEnabled', false);
    t.foreign(1);
    t.foreign(2);
    const log = t.logNight(5);
    expect(await t.engine.enableSync()).toBe(true);
    expect(t.imports()).toHaveLength(2);
    expect(t.hc.ownRecords()).toHaveLength(1);
    expect(t.hc.ownRecord(log.id)).toMatchObject({ recordingMethod: 'manualEntry', startOffsetSec: 7200, endOffsetSec: 7200 });
    expect(t.repo.getSession(log.id)!.health).toMatchObject({ needsSync: false, hcRecordId: t.hc.ownRecord(log.id)!.recordId });
    // the own record comes back through changes and is not imported
    await t.engine.sync('full');
    await t.engine.sync('forceResync');
    expect(t.sessions()).toHaveLength(3);
    expect(t.hc.ownRecords()).toHaveLength(1);
  });

  test('edit owned three times -> one hc record with the latest version and times', async () => {
    const t = setup(options);
    const log = t.logNight(3);
    await t.engine.sync('full');
    for (const endH of [8, 9, 10]) {
      t.clock.now += H;
      t.editNight(log.id, 3, endH);
      await t.engine.sync('push');
    }
    expect(t.hc.ownRecords()).toHaveLength(1);
    const record = t.hc.ownRecord(log.id)!;
    expect(record.endMs).toBe(t.at(3, 10));
    expect(record.clientRecordVersion).toBe(t.repo.getSession(log.id)!.health!.syncVersion);
  });

  test('adopted edit -> zero hc writes; deleting it -> no outbox row, the night stays out', async () => {
    const t = setup(options);
    t.foreign(2);
    await t.engine.sync('full');
    const imp = t.imports()[0];
    t.hc.resetCalls();
    t.editNight(imp.id, 2, 8);
    await t.engine.sync('push');
    expect(t.hc.callCount('upsertSleep')).toBe(0);
    expect(t.hc.ownRecords()).toHaveLength(0);
    t.repo.deleteSession(imp.id, t.clock.now);
    expect(t.repo.health.listOutbox()).toEqual([]);
    await t.engine.sync('forceResync');
    expect(t.sessions()).toHaveLength(0);
  });

  test('source moves an adopted night -> twilight keeps the edit and imports no second copy', async () => {
    const t = setup(options);
    t.foreign(2);
    await t.engine.sync('full');
    const imp = t.imports()[0];
    t.editNight(imp.id, 2, 8);
    t.foreign(2, WATCH, { startH: 12, endH: 18 });
    await t.engine.sync('full');
    expect(t.sessions().map((s) => s.id)).toEqual([imp.id]);
    expect(t.repo.getSession(imp.id)!.endTime).toBe(t.at(2, 8));
  });

  test('local delete while disabled -> enable later -> remote delete, no rehydration', async () => {
    const t = setup(options);
    const log = t.logNight(3);
    await t.engine.sync('full');
    await t.engine.disableSync();
    t.repo.deleteSession(log.id, t.clock.now);
    t.settings.set('healthSyncEnabled', false);
    expect(await t.engine.enableSync()).toBe(true);
    expect(t.hc.ownRecords()).toHaveLength(0);
    await t.engine.sync('forceResync');
    expect(t.sessions()).toHaveLength(0);
  });

  test('local delete -> write-only run drains the outbox -> read run replays the old own upsert -> no rehydration', async () => {
    const t = setup(options);
    const log = t.logNight(3);
    await t.engine.sync('full');
    t.repo.deleteSession(log.id, t.clock.now);
    t.hc.read = false;
    await t.engine.sync('push');
    expect(t.hc.ownRecords()).toHaveLength(0);
    expect(t.repo.health.listOutbox()).toEqual([]);
    t.hc.read = true;
    await t.engine.sync('full');
    await t.engine.sync('forceResync');
    expect(t.sessions()).toHaveLength(0);
  });

  test('foreign update and delete via changes; delete + re-insert across two pages keeps the session id', async () => {
    const t = setup(options);
    const rec = t.foreign(2);
    await t.engine.sync('full');
    const id = t.imports()[0].id;
    t.foreign(2, WATCH, { endH: 8 });
    await t.engine.sync('full');
    expect(t.repo.getSession(id)!.endTime).toBe(t.at(2, 8));
    t.hc.changesPageSize = 1;
    t.hc.removeRecord(rec.recordId);
    t.foreign(2, WATCH, { cid: 'reinserted', endH: 8 });
    await t.engine.sync('full');
    expect(t.imports().map((s) => s.id)).toEqual([id]);
    const latest = [...t.hc.records.values()].find((r) => r.clientRecordId === 'reinserted')!;
    t.hc.removeRecord(latest.recordId);
    await t.engine.sync('full');
    expect(t.imports()).toHaveLength(0);
  });

  test('crash after the last page commit, before reconcile -> next pass with zero changes still reconciles', async () => {
    const t = setup(options);
    await t.engine.sync('full');
    t.foreign(4);
    const spy = jest.spyOn(t.repo.health, 'applyInboundPlan').mockImplementationOnce(() => {
      throw new Error('process died');
    });
    await t.engine.sync('full');
    expect(t.imports()).toHaveLength(0);
    expect(t.repo.health.listMirror()).toHaveLength(1);
    spy.mockRestore();
    await t.engine.sync('full');
    expect(t.imports()).toHaveLength(1);
  });

  test('remote delete of one recent twilight record -> held card, kept locally, not re-exported; edit exports again', async () => {
    const t = setup(options);
    const log = t.logNight(28);
    await t.engine.sync('full');
    t.hc.removeRecord(t.hc.ownRecord(log.id)!.recordId);
    await t.engine.sync('full');
    expect(t.repo.getSession(log.id)).not.toBeNull();
    expect(t.engine.snapshot().heldRemoteDeletions).toEqual([log.id]);
    t.engine.keepHeldRemoteDeletions();
    await t.engine.sync('forceResync');
    expect(t.hc.ownRecords()).toHaveLength(0);
    expect(t.engine.snapshot().heldRemoteDeletions).toEqual([]);
    t.editNight(log.id, 28, 8);
    await t.engine.sync('push');
    expect(t.hc.ownRecord(log.id)).toBeDefined();
  });

  test('"Remove from Twilight" deletes held nights locally with a ledger row and no outbox error', async () => {
    const t = setup(options);
    const log = t.logNight(28);
    await t.engine.sync('full');
    t.hc.removeRecord(t.hc.ownRecord(log.id)!.recordId);
    await t.engine.sync('full');
    t.engine.removeHeldRemoteDeletions();
    expect(t.repo.getSession(log.id)).toBeNull();
    expect(t.repo.health.deletedSessionIds().has(log.id)).toBe(true);
    expect(t.repo.health.listOutbox()).toEqual([]);
    await t.engine.sync('full');
    expect(t.engine.snapshot().lastError).toBeNull();
  });

  test('auto-delete of 40 old nights, one per day over 40 runs -> no card, nothing deleted, nothing re-exported', async () => {
    const t = setup(options);
    t.clock.now = T0 + 100 * DAY;
    const logs = Array.from({ length: 40 }, (_, i) => t.logNight(i));
    await t.engine.sync('full');
    expect(t.hc.ownRecords()).toHaveLength(40);
    for (const log of logs) {
      t.clock.now += DAY;
      t.hc.removeRecord(t.hc.ownRecord(log.id)!.recordId);
      await t.engine.sync('full');
    }
    expect(t.sessions()).toHaveLength(40);
    expect(t.hc.ownRecords()).toHaveLength(0);
    expect(t.engine.snapshot().heldRemoteDeletions).toEqual([]);
    expect(t.engine.snapshot().lastError).toBeNull();
  });

  test('token expired -> silent full re-read, no duplicates, no error', async () => {
    const t = setup(options);
    t.foreign(1);
    t.logNight(3);
    await t.engine.sync('full');
    t.hc.expireTokens();
    t.foreign(5);
    const result = await t.engine.sync('full');
    expect(result.error).toBeNull();
    expect(t.imports()).toHaveLength(2);
    expect(t.sessions()).toHaveLength(3);
    expect(t.hc.ownRecords()).toHaveLength(1);
  });

  test('invalid token (restored from elsewhere) -> silent full re-read, never stores an empty token', async () => {
    const t = setup(options);
    t.foreign(1);
    await t.engine.sync('full');
    t.repo.health.setState('changesToken', 'bogus-token');
    const result = await t.engine.sync('full');
    expect(result.error).toBeNull();
    expect(t.imports()).toHaveLength(1);
    expect(t.repo.health.getState('changesToken')).toMatch(/^g\d+-\d+$/);
  });

  test('outbox with one never-landed id among 50 -> drains completely', async () => {
    const t = setup(options);
    const logs = Array.from({ length: 50 }, (_, i) => t.logNight(i % 29));
    await t.engine.sync('full');
    // one record disappeared in hc without twilight noticing (hc ui + no read since)
    const lost = logs[7];
    t.db.runSync('update sleep_sessions set hc_written = 1 where id = ?', [lost.id]);
    t.hc.records.delete(t.hc.ownRecord(lost.id)!.recordId);
    for (const log of logs) t.repo.deleteSession(log.id, t.clock.now);
    expect(t.repo.health.listOutbox()).toHaveLength(50);
    await t.engine.sync('push');
    expect(t.repo.health.listOutbox()).toEqual([]);
    expect(t.hc.ownRecords()).toHaveLength(0);
  });

  test('crash injection: upsert lands then the call fails -> re-run converges, one record, synced', async () => {
    const t = setup(options);
    const log = t.logNight(3);
    const upsert = t.hc.upsertSleep.bind(t.hc);
    jest.spyOn(t.hc, 'upsertSleep').mockImplementationOnce(async (writes) => {
      await upsert(writes);
      throw new HealthConnectError('E_HC_IO', 'binder died');
    });
    const first = await t.engine.sync('full');
    expect(first.error?.code).toBe('remote');
    expect(t.repo.getSession(log.id)!.health!.needsSync).toBe(true);
    await t.engine.sync('push');
    expect(t.hc.ownRecords()).toHaveLength(1);
    expect(t.repo.getSession(log.id)!.health!.needsSync).toBe(false);
  });

  test('crash injection: delete lands then the call fails -> re-run converges', async () => {
    const t = setup(options);
    const log = t.logNight(3);
    await t.engine.sync('full');
    t.repo.deleteSession(log.id, t.clock.now);
    const del = t.hc.deleteSleepByClientRecordIds.bind(t.hc);
    jest.spyOn(t.hc, 'deleteSleepByClientRecordIds').mockImplementationOnce(async (ids) => {
      await del(ids);
      throw new HealthConnectError('E_HC_IO', 'binder died');
    });
    await t.engine.sync('push');
    expect(t.repo.health.listOutbox()).toHaveLength(1);
    await t.engine.sync('push');
    expect(t.repo.health.listOutbox()).toEqual([]);
    expect(t.hc.ownRecords()).toHaveLength(0);
  });

  test('crash between write and mark (same version re-sent) -> idempotent', async () => {
    const t = setup(options);
    const log = t.logNight(3);
    jest.spyOn(t.repo.health, 'markSynced').mockImplementationOnce(() => {
      throw new Error('process died');
    });
    await t.engine.sync('full');
    expect(t.repo.getSession(log.id)!.health!.needsSync).toBe(true);
    await t.engine.sync('push');
    expect(t.hc.ownRecords()).toHaveLength(1);
    expect(t.repo.getSession(log.id)!.health!.needsSync).toBe(false);
  });
});

describe('sync engine', () => {
  test('reinstall with write-only permission: hc holds version 5 from the old install -> the next edit replaces it', async () => {
    const t = setup({ equalVersionReplaces: false });
    const log = t.logNight(3);
    // a record an earlier install wrote with an old counter version
    await t.hc.upsertSleep([
      { clientRecordId: `twilight.sleep-session.${log.id}`, clientRecordVersion: 5, startMs: t.at(3, -2), endMs: t.at(3, 5), startZoneId: 'UTC', endZoneId: 'UTC', recordingMethod: 'manualEntry' },
    ]);
    t.hc.read = false;
    t.editNight(log.id, 3, 9);
    await t.engine.sync('push');
    expect(t.hc.ownRecord(log.id)).toMatchObject({ startMs: t.at(3), endMs: t.at(3, 9) });
  });

  test('clock backwards: version still increases; a higher remote version self-heals with read', async () => {
    const t = setup({ equalVersionReplaces: false });
    const log = t.logNight(3);
    await t.engine.sync('full');
    const v1 = t.repo.getSession(log.id)!.health!.syncVersion;
    t.clock.now -= DAY;
    t.editNight(log.id, 3, 9);
    expect(t.repo.getSession(log.id)!.health!.syncVersion).toBe(v1 + 1);
    await t.engine.sync('push');
    expect(t.hc.ownRecord(log.id)!.endMs).toBe(t.at(3, 9));
    // a device with a clock far ahead wrote this record earlier
    const record = t.hc.ownRecord(log.id)!;
    t.hc.records.set(record.recordId, { ...record, clientRecordVersion: v1 + 10_000, endMs: t.at(3, 6) });
    await t.engine.sync('forceResync');
    expect(t.repo.getSession(log.id)!.health!.syncVersion).toBeGreaterThan(v1 + 10_000);
    expect(t.hc.ownRecord(log.id)!.endMs).toBe(t.at(3, 9));
  });

  test('a replayed older own change never lowers hc_remote_version', async () => {
    const t = setup();
    const log = t.logNight(3);
    await t.engine.sync('full');
    const v1 = t.repo.getSession(log.id)!.health!.hcRemoteVersion!;
    t.clock.now += H;
    t.editNight(log.id, 3, 9);
    await t.engine.sync('push');
    const v2 = t.repo.getSession(log.id)!.health!.hcRemoteVersion!;
    expect(v2).toBeGreaterThan(v1);
    // the changes feed still carries the v1 upsert; it must not win
    await t.engine.sync('full');
    expect(t.repo.getSession(log.id)!.health).toMatchObject({ hcRemoteVersion: v2, needsSync: false });
  });

  test('device restore: a foreign installId resets once; owned nights re-export; stale links do not delete imports', async () => {
    const t = setup();
    t.foreign(2);
    const log = t.logNight(4);
    await t.engine.sync('full');
    // the same database restored onto a new device with an empty hc store
    const fresh = new FakeHealthConnect({ equalVersionReplaces: true });
    fresh.installId = 'install-2';
    fresh.clock = () => t.clock.now;
    const engine = new HealthSyncEngine({ adapter: fresh, repo: t.repo, settings: t.settings, isForeground: () => true, now: () => t.clock.now, deviceZone: () => 'Europe/Paris' });
    await engine.sync('full');
    await engine.sync('full');
    expect(t.imports()).toHaveLength(1);
    expect(fresh.ownRecord(log.id)).toBeDefined();
    expect(fresh.ownRecords()).toHaveLength(1);
    expect(t.repo.health.getState('installId')).toBe('install-2');
  });

  test('archive-restored imports (no links) onto an empty hc survive two pulls', async () => {
    const t = setup();
    t.db.runSync(
      `insert into sleep_sessions (id, tag, start_time, end_time, start_tz, end_tz, created_at, updated_at,
         is_health_imported, health_provider, health_night_key, health_source_id, needs_health_sync)
       values ('restored', 'Health Connect', ?, ?, 'UTC', 'UTC', 0, 0, 1, 'health_connect', 'k', ?, 0)`,
      [t.at(2), t.at(2, 7), WATCH]
    );
    await t.engine.sync('full');
    await t.engine.sync('forceResync');
    expect(t.imports().map((s) => s.id)).toEqual(['restored']);
  });

  test('rate limit on batch 2 of 3 -> batch 1 synced, 2 and 3 pending, no per-record retries', async () => {
    const t = setup();
    for (let i = 0; i < 120; i += 1) {
      t.repo.createManualLog({ startTime: t.at(0) + i * 6 * H, endTime: t.at(0) + i * 6 * H + 5 * H, startTimeZone: 'UTC', endTimeZone: 'UTC', nowMs: t.clock.now });
    }
    let upserts = 0;
    t.hc.beforeCall = (method) => {
      if (method === 'upsertSleep' && ++upserts === 2) throw new HealthConnectError('E_HC_RATE_LIMIT', 'quota');
    };
    const result = await t.engine.sync('full');
    expect(result.error?.code).toBe('rateLimit');
    expect(upserts).toBe(2);
    expect(t.sessions().filter((s) => !s.health!.needsSync)).toHaveLength(50);
    expect(t.hc.ownRecords()).toHaveLength(50);
  });

  test('invalid record -> poisoned at its version, skipped next run, exported after an edit', async () => {
    const t = setup();
    const good = t.logNight(2);
    const bad = t.logNight(4);
    let rejectBad = true;
    const upsert = t.hc.upsertSleep.bind(t.hc);
    jest.spyOn(t.hc, 'upsertSleep').mockImplementation(async (writes) => {
      if (rejectBad && writes.some((w) => w.clientRecordId.endsWith(bad.id))) {
        throw new HealthConnectError('E_HC_INVALID', 'IllegalArgumentException');
      }
      return upsert(writes);
    });
    const first = await t.engine.sync('full');
    expect(first.error).toMatchObject({ code: 'invalid', sessionId: bad.id });
    expect(t.hc.ownRecord(good.id)).toBeDefined();
    expect(t.hc.ownRecord(bad.id)).toBeUndefined();
    const callsBefore = (t.hc.upsertSleep as jest.Mock).mock.calls.length;
    await t.engine.sync('push');
    expect((t.hc.upsertSleep as jest.Mock).mock.calls.length).toBe(callsBefore);
    rejectBad = false;
    t.editNight(bad.id, 4, 8);
    await t.engine.sync('push');
    expect(t.hc.ownRecord(bad.id)).toBeDefined();
  });

  test('read revoked between page 1 and page 2 -> page 1 committed, token kept, no reconcile; next run continues', async () => {
    const t = setup();
    await t.engine.sync('full');
    t.foreign(1);
    t.foreign(3);
    t.hc.changesPageSize = 1;
    let pages = 0;
    t.hc.beforeCall = (method) => {
      if (method === 'getChanges' && ++pages === 2) t.hc.read = false;
    };
    const result = await t.engine.sync('full');
    // write is still granted: an interruption, not an error card
    expect(result.error).toBeNull();
    expect(t.engine.snapshot().status?.read).toBe(false);
    expect(t.repo.health.listMirror()).toHaveLength(1);
    expect(t.imports()).toHaveLength(0);
    t.hc.beforeCall = null;
    t.hc.read = true;
    await t.engine.sync('full');
    expect(t.imports()).toHaveLength(2);
  });

  test('every permission revoked mid-run -> permission error', async () => {
    const t = setup();
    await t.engine.sync('full');
    t.foreign(1);
    t.hc.beforeCall = (method) => {
      if (method === 'getChanges') {
        t.hc.read = false;
        t.hc.write = false;
      }
    };
    const result = await t.engine.sync('full');
    expect(result.error?.code).toBe('permission');
  });

  test('SecurityException while permission is still granted -> no error card', async () => {
    const t = setup();
    await t.engine.sync('full');
    t.hc.failOnce('getChanges', 'E_HC_PERMISSION');
    const result = await t.engine.sync('full');
    expect(result.error).toBeNull();
  });

  test('background request -> outbound only, no read calls, at most one batch', async () => {
    const t = setup();
    await t.engine.sync('full');
    for (let i = 0; i < 60; i += 1) {
      t.repo.createManualLog({ startTime: t.at(0) + i * 6 * H, endTime: t.at(0) + i * 6 * H + 5 * H, startTimeZone: 'UTC', endTimeZone: 'UTC', nowMs: t.clock.now });
    }
    t.env.foreground = false;
    t.hc.resetCalls();
    await t.engine.sync('full');
    expect(t.hc.callCount('getChanges') + t.hc.callCount('readSleep') + t.hc.callCount('getChangesToken')).toBe(0);
    expect(t.hc.callCount('upsertSleep')).toBe(1);
    expect(t.hc.ownRecords()).toHaveLength(50);
  });

  test('single flight: concurrent calls run at most twice and force resync wins', async () => {
    const t = setup();
    const runs = [t.engine.sync('push'), t.engine.sync('push'), t.engine.sync('forceResync'), t.engine.sync('full')];
    const results = await Promise.all(runs);
    expect(t.hc.callCount('getStatus')).toBe(2);
    expect(results.map((r) => r.kind)).toEqual(['push', 'forceResync', 'forceResync', 'forceResync']);
  });

  test('runExclusive waits for the current run and blocks new runs until done', async () => {
    const t = setup();
    const order: string[] = [];
    const run = t.engine.sync('full').then(() => order.push('run'));
    let blocked: Promise<unknown> = Promise.resolve();
    const exclusive = t.engine.runExclusive(async () => {
      order.push('exclusive');
      blocked = t.engine.sync('push').then(() => order.push('after'));
      await new Promise((r) => setTimeout(r, 5));
      order.push('exclusive done');
    });
    await Promise.all([run, exclusive]);
    await blocked;
    await t.engine.idle();
    expect(order).toEqual(['run', 'exclusive', 'exclusive done', 'after']);
  });

  test('force resync writes only the sessions that differ', async () => {
    const t = setup();
    const logs = [t.logNight(1), t.logNight(2), t.logNight(3)];
    await t.engine.sync('full');
    const record = t.hc.ownRecord(logs[1].id)!;
    t.hc.records.set(record.recordId, { ...record, endMs: record.endMs - H });
    t.hc.resetCalls();
    await t.engine.sync('forceResync');
    const writes = t.hc.calls.filter((c) => c.method === 'upsertSleep').flatMap((c) => c.arg as { clientRecordId: string }[]);
    expect(writes.map((w) => w.clientRecordId)).toEqual([`twilight.sleep-session.${logs[1].id}`]);
    expect(t.hc.ownRecord(logs[1].id)!.endMs).toBe(t.at(2, 7));
  });

  test('demo active -> no adapter calls at all; real nights logged during demo export after exit', async () => {
    const t = setup();
    t.settings.set('isDemoDataActive', true);
    t.repo.replaceSessionsWithPrefix(DEMO_SESSION_ID_PREFIX, createDemoSleepSessions(t.clock.now));
    const real = t.logNight(25);
    const result = await t.engine.sync('forceResync');
    expect(result.skipped).toBe('demo');
    expect(t.hc.callCount()).toBe(0);
    t.repo.deleteSessionsWithPrefix(DEMO_SESSION_ID_PREFIX);
    t.settings.set('isDemoDataActive', false);
    await t.engine.sync('full');
    expect(t.hc.ownRecords().map((r) => r.clientRecordId)).toEqual([`twilight.sleep-session.${real.id}`]);
    expect(t.engine.snapshot().lastError).toBeNull();
  });

  test('demo rows that exist while sync runs are never exported', async () => {
    const t = setup();
    t.repo.replaceSessionsWithPrefix(DEMO_SESSION_ID_PREFIX, createDemoSleepSessions(t.clock.now).slice(0, 5));
    await t.engine.sync('full');
    expect(t.hc.ownRecords()).toHaveLength(0);
  });

  test('demo turned on mid-run aborts quietly before anything is written', async () => {
    const t = setup();
    t.logNight(2);
    t.hc.beforeCall = (method) => {
      if (method === 'getInstallId') t.settings.set('isDemoDataActive', true);
    };
    const result = await t.engine.sync('full');
    expect(result.skipped).toBe('demo');
    expect(t.hc.callCount('upsertSleep')).toBe(0);
  });

  test('reinstall: empty db + own records in hc -> orphans rehydrated; ledger and demo ids never', async () => {
    const t = setup();
    const writes = [
      { id: 'kept-manual', method: 'manualEntry' as const, d: 1 },
      { id: 'kept-tracked', method: 'activelyRecorded' as const, d: 2 },
      { id: 'deleted-here', method: 'manualEntry' as const, d: 3 },
      { id: `${DEMO_SESSION_ID_PREFIX}9`, method: 'manualEntry' as const, d: 4 },
    ];
    await t.hc.upsertSleep(
      writes.map((w) => ({ clientRecordId: `twilight.sleep-session.${w.id}`, clientRecordVersion: 777, startMs: t.at(w.d), endMs: t.at(w.d, 7), startZoneId: 'Europe/Paris', endZoneId: 'Europe/Paris', recordingMethod: w.method }))
    );
    t.repo.health.addToLedger('deleted-here', t.clock.now);
    await t.engine.sync('full');
    const byId = new Map(t.sessions().map((s) => [s.id, s]));
    expect([...byId.keys()].sort()).toEqual(['kept-manual', 'kept-tracked']);
    expect(byId.get('kept-manual')).toMatchObject({ tag: 'Manual Log', startTimeZone: 'Europe/Paris', health: { syncVersion: 777, needsSync: false } });
    expect(byId.get('kept-tracked')!.tag).toBe('Sleep Mode');
    // an edit of a rehydrated night replaces the record (clock beats 777)
    t.editNight('kept-manual', 1, 9);
    await t.engine.sync('push');
    expect(t.hc.ownRecord('kept-manual')!.endMs).toBe(t.at(1, 9));
    expect(t.hc.ownRecords()).toHaveLength(4);
  });

  test('a twilight-prefixed record from another package is imported as foreign, never rehydrated or deleted', async () => {
    const t = setup();
    t.hc.foreignUpsert({ origin: 'com.rami.twilight.debug', cid: 'twilight.sleep-session.fake', startMs: t.at(2), endMs: t.at(2, 7) });
    await t.engine.sync('full');
    expect(t.sessions()).toHaveLength(1);
    expect(t.imports()).toHaveLength(1);
    expect(t.sessions()[0].id).not.toBe('fake');
  });

  test('disable -> token and mirror cleared, flags kept; re-enable -> full read', async () => {
    const t = setup();
    t.foreign(1);
    const log = t.logNight(3);
    await t.engine.sync('full');
    await t.engine.disableSync();
    expect(t.repo.health.getState('changesToken')).toBeNull();
    expect(t.repo.health.listMirror()).toEqual([]);
    expect(t.imports()).toHaveLength(1);
    expect(t.repo.getSession(log.id)!.health!.hcRecordId).not.toBeNull();
    t.hc.resetCalls();
    expect(await t.engine.enableSync()).toBe(true);
    expect(t.hc.callCount('getChangesToken')).toBe(1);
    expect(t.hc.callCount('readSleep')).toBeGreaterThan(0);
    expect(t.sessions()).toHaveLength(2);
  });

  test('enable without any grant stays off with the permission error (swift enableSync)', async () => {
    const t = setup();
    t.settings.set('healthSyncEnabled', false);
    t.hc.read = false;
    t.hc.write = false;
    t.hc.grantOnRequest = { read: false, write: false, history: false };
    expect(await t.engine.enableSync()).toBe(false);
    expect(t.settings.get('healthSyncEnabled')).toBe(false);
    expect(t.engine.snapshot().lastError?.code).toBe('permission');
  });

  test('a denied request is remembered so the ui shows denied, not notDetermined (2.8)', async () => {
    const t = setup();
    t.settings.set('healthSyncEnabled', false);
    t.hc.read = false;
    t.hc.write = false;
    expect(t.engine.snapshot().permissionRequested).toBe(false);
    t.hc.grantOnRequest = { read: false, write: false, history: false };
    await t.engine.enableSync();
    expect(t.engine.snapshot().permissionRequested).toBe(true);
  });

  test('dev token invalidation -> next sync is a silent full re-read, no duplicates, no error (7.3 step 17)', async () => {
    const t = setup();
    expect(t.engine.invalidateChangesTokenForTesting()).toBe(false);
    t.foreign(1);
    t.logNight(3);
    await t.engine.sync('full');
    expect(t.engine.invalidateChangesTokenForTesting()).toBe(true);
    t.hc.resetCalls();
    const result = await t.engine.sync('full');
    expect(t.hc.callCount('getChangesToken')).toBe(1);
    expect(result.error).toBeNull();
    expect(t.sessions()).toHaveLength(2);
    expect(t.hc.ownRecords()).toHaveLength(1);
    expect(t.repo.health.getState('changesToken')).not.toBe('bogus-token');
  });

  test('sync off -> skipped without adapter calls', async () => {
    const t = setup();
    t.settings.set('healthSyncEnabled', false);
    expect((await t.engine.sync('full')).skipped).toBe('off');
    expect(t.hc.callCount()).toBe(0);
  });

  test('informational pull results never land in lastError (fixes swift defect 4)', async () => {
    const t = setup();
    t.foreign(1);
    t.logNight(1);
    const result = await t.engine.sync('forceResync');
    expect(result.pull?.message).toContain('already has matching nights');
    expect(t.engine.snapshot().lastError).toBeNull();
    expect(t.engine.snapshot().lastPullResult?.message).toContain('already has matching nights');
  });

  test('manual log over an import supersedes it; deleting the log brings the import back', async () => {
    const t = setup();
    t.foreign(2);
    await t.engine.sync('full');
    const log = t.repo.createManualLog({ startTime: t.at(2, 1), endTime: t.at(2, 8), startTimeZone: 'Europe/Paris', endTimeZone: 'Europe/Paris', nowMs: t.clock.now });
    await t.engine.sync('full');
    expect(t.sessions().map((s) => s.id)).toEqual([log.id]);
    t.repo.deleteSession(log.id, t.clock.now);
    await t.engine.sync('full');
    expect(t.imports()).toHaveLength(1);
  });

  test('deleting an import tombstones it and the second app copy of that night', async () => {
    const t = setup();
    t.foreign(2, WATCH);
    t.foreign(2, OTHER, { startH: 0.5 });
    await t.engine.sync('full');
    expect(t.imports()).toHaveLength(1);
    t.repo.deleteSession(t.imports()[0].id, t.clock.now);
    await t.engine.sync('forceResync');
    expect(t.sessions()).toHaveLength(0);
  });

  test('history permission missing: foreign records outside the window are not imported and absence needs evidence', async () => {
    const t = setup();
    t.hc.history = false;
    t.hc.windowStartMs = t.at(10);
    t.foreign(2);
    t.foreign(12);
    await t.engine.sync('full');
    expect(t.imports().map((s) => s.startTime)).toEqual([t.at(12)]);
    const result = await t.engine.sync('forceResync');
    expect(result.pull?.message).toBeDefined();
    expect(t.imports()).toHaveLength(1);
  });

  test('own package filter: records of the own package never reach the mirror', async () => {
    const t = setup();
    t.logNight(3);
    await t.engine.sync('full');
    await t.engine.sync('forceResync');
    expect(t.repo.health.listMirror().some((r) => r.dataOrigin === OWN_PACKAGE)).toBe(false);
  });
});
