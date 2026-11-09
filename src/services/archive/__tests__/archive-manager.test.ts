// backup export -> wipe -> import over in-memory sqlite, and the health
// connect engine afterwards (docs/health-connect.md 6.4, 7.1, 7.3 step 19)
import { FakeHealthConnect } from '../../../../tests/helpers/fake-health-connect';
import { memoryDb } from '../../../../tests/helpers/memory-db';
import { ArchiveRepo } from '../../../data/archive-repo';
import { migrate } from '../../../data/db';
import { SessionRepo } from '../../../data/session-repo';
import { SettingsStore, type KeyValueStorage } from '../../../data/settings-store';
import { createDemoSleepSessions, DEMO_SESSION_ID_PREFIX } from '../../../demo/demo-mode';
import { clientRecordIdFor } from '../../../domain/health/ownership';
import { HealthSyncEngine } from '../../health-connect/sync-engine';
import { ArchiveManager, MAX_PRE_IMPORT_BACKUPS, utcStamp, type BackupFolder } from '../archive-manager';

const H = 3600_000;
const DAY = 24 * H;
const T0 = Date.UTC(2026, 8, 1, 21, 0);
const WATCH = 'com.watch.sleep';

function memoryKv(): KeyValueStorage {
  const map = new Map<string, string>();
  return { getItemSync: (k) => map.get(k) ?? null, setItemSync: (k, v) => void map.set(k, v) };
}

function memoryFolder(): BackupFolder & { files: Map<string, string> } {
  const files = new Map<string, string>();
  return {
    files,
    write: (name, contents) => void files.set(name, contents),
    list: () => [...files.keys()],
    remove: (name) => void files.delete(name),
  };
}

// one device: database, settings, health connect engine and archive manager
function device(hc: FakeHealthConnect, clock: { now: number }) {
  const db = memoryDb();
  migrate(db, clock.now);
  const repo = new SessionRepo(db);
  const archiveRepo = new ArchiveRepo(db);
  const settings = new SettingsStore(memoryKv());
  const backups = memoryFolder();
  const engine = new HealthSyncEngine({
    adapter: hc,
    repo,
    settings,
    isForeground: () => true,
    now: () => clock.now,
    deviceZone: () => 'Europe/Paris',
  });
  const manager = new ArchiveManager({
    repo: archiveRepo,
    settings,
    backups,
    runExclusive: (fn) => engine.runExclusive(fn),
    timeZone: () => 'Europe/Paris',
    appVersion: '1.0.0',
    platform: 'android',
    now: () => clock.now,
  });
  const at = (d: number, h = 0) => T0 + d * DAY + h * H;
  const logNight = (d: number) =>
    repo.createManualLog({ startTime: at(d), endTime: at(d, 7), startTimeZone: 'Europe/Paris', endTimeZone: 'Europe/Paris', nowMs: clock.now });
  return { db, repo, archiveRepo, settings, backups, engine, manager, at, logNight };
}

function setup() {
  const hc = new FakeHealthConnect({ equalVersionReplaces: true });
  const clock = { now: T0 + 30 * DAY };
  hc.clock = () => clock.now;
  return { hc, clock, a: device(hc, clock) };
}

describe('archive manager', () => {
  test('export -> wipe -> import restores sessions, tombstones and settings, not healthSyncEnabled', async () => {
    const { hc, clock, a } = setup();
    const n1 = a.logNight(1);
    const n2 = a.logNight(2);
    a.repo.health.upsertTombstone('com.watch|2026-09-05|1', ['rec-1'], a.at(4));
    a.settings.set('optimalSleepMinutes', 23 * 60);
    a.settings.set('themeMode', 'light');
    a.settings.set('themePalette', 'amethyst');
    a.settings.set('isOnboarded', true);
    a.settings.set('healthSyncEnabled', true);
    const json = a.manager.exportArchiveJson();

    clock.now += DAY;
    const b = device(hc, clock);
    const prepared = b.manager.prepareImport(json);
    expect(prepared.preview).toMatchObject({ sessionCount: 2, newSessions: 2, updatedSessions: 0, settingsChanges: 2, appearanceChanges: 2 });
    const result = await b.manager.runImport(prepared.archive);

    expect(result.backupName).toBe(`twilight_pre_import_backup_${utcStamp(clock.now)}.json`);
    expect(b.backups.files.has(result.backupName)).toBe(true);
    const restored = b.repo.listValidSessions().map((s) => s.id).sort();
    expect(restored).toEqual([n1.id, n2.id].sort());
    expect(b.repo.getSession(n1.id)).toMatchObject({ startTime: n1.startTime, endTime: n1.endTime, tag: 'Manual Log', createdAt: n1.createdAt });
    expect(b.repo.getSession(n1.id)!.health).toMatchObject({ needsSync: true, syncVersion: clock.now, hcRecordId: null });
    expect(b.repo.health.listTombstones()).toEqual([{ nightKey: 'com.watch|2026-09-05|1', deletedAt: a.at(4), recordIds: ['rec-1'] }]);
    expect(b.settings.load()).toMatchObject({
      isOnboarded: true,
      optimalSleepMinutes: 1380,
      themeMode: 'light',
      themePalette: 'amethyst',
      healthSyncEnabled: false,
    });
    // importing the same file again changes nothing
    expect(b.manager.prepareImport(json).preview).toMatchObject({ newSessions: 0, updatedSessions: 0, settingsChanges: 0, appearanceChanges: 0 });
  });

  test('device-bound health connect columns are not exported and keep their local values', async () => {
    const { a } = setup();
    const night = a.logNight(1);
    a.repo.health.markSynced(night.id, a.repo.getSession(night.id)!.health!.syncVersion, 'hc-record-1');
    const json = a.manager.exportArchiveJson();
    expect(json).not.toContain('hc-record-1');
    expect(json).not.toContain('hcRecordId');
    // the file carries an older edit of the same night
    const edited = JSON.parse(json);
    edited.sessions[0].endTime = new Date(a.at(1, 9)).toISOString();
    await a.manager.runImport(a.manager.prepareImport(JSON.stringify(edited)).archive);
    const row = a.repo.health.getSessionRow(night.id)!;
    expect(row).toMatchObject({ hc_record_id: 'hc-record-1', hc_written: 1, end_time: a.at(1, 9), needs_health_sync: 1 });
  });

  test('restoring a deleted owned night clears its ledger row and its pending remote delete', async () => {
    const { a } = setup();
    const night = a.logNight(1);
    a.repo.health.markWritten([night.id]);
    const json = a.manager.exportArchiveJson();
    a.repo.deleteSession(night.id);
    expect(a.repo.health.deletedSessionIds().has(night.id)).toBe(true);
    expect(a.repo.health.listOutbox()).toHaveLength(1);
    await a.manager.runImport(a.manager.prepareImport(json).archive);
    expect(a.repo.getSession(night.id)).not.toBeNull();
    expect(a.repo.health.deletedSessionIds().size).toBe(0);
    expect(a.repo.health.listOutbox()).toEqual([]);
  });

  test('demo sessions are never exported and never imported', async () => {
    const { a } = setup();
    a.logNight(1);
    a.repo.replaceSessionsWithPrefix(DEMO_SESSION_ID_PREFIX, createDemoSleepSessions(a.at(10)).slice(0, 3));
    const json = a.manager.exportArchiveJson();
    expect(json).not.toContain(DEMO_SESSION_ID_PREFIX);
    const withDemo = JSON.parse(json);
    withDemo.sessions.push({ ...withDemo.sessions[0], id: `${DEMO_SESSION_ID_PREFIX}x` });
    const prepared = a.manager.prepareImport(JSON.stringify(withDemo));
    expect(prepared.preview).toMatchObject({ sessionCount: 1, newSessions: 0 });
  });

  test('keeps the newest pre-import backups only', async () => {
    const { clock, a } = setup();
    const json = a.manager.exportArchiveJson();
    for (let i = 0; i < MAX_PRE_IMPORT_BACKUPS + 3; i += 1) {
      clock.now += 1000;
      await a.manager.runImport(a.manager.prepareImport(json).archive);
    }
    const names = [...a.backups.files.keys()].sort();
    expect(names).toHaveLength(MAX_PRE_IMPORT_BACKUPS);
    expect(names.at(-1)).toBe(`twilight_pre_import_backup_${utcStamp(clock.now)}.json`);
  });

  test('restore onto a device whose health connect still has the old records: no duplicates, tombstoned night stays out, imports re-link', async () => {
    const { hc, clock, a } = setup();
    a.settings.set('healthSyncEnabled', true);
    hc.foreignUpsert({ origin: WATCH, cid: 'w-3', startMs: a.at(3), endMs: a.at(3, 7) });
    hc.foreignUpsert({ origin: WATCH, cid: 'w-5', startMs: a.at(5), endMs: a.at(5, 7) });
    const owned = a.logNight(1);
    await a.engine.sync('full');
    const imports = a.repo.listValidSessions().filter((s) => s.health?.imported);
    expect(imports).toHaveLength(2);
    // the user deletes the day 5 import: tombstoned
    a.repo.deleteSession(imports.find((s) => s.startTime === a.at(5))!.id);
    expect(hc.ownRecords()).toHaveLength(1);
    const json = a.manager.exportArchiveJson();

    // app data wiped (pm clear): fresh database, onboarding without health connect
    clock.now += DAY;
    const b = device(hc, clock);
    await b.manager.runImport(b.manager.prepareImport(json).archive);
    const restoredImport = b.repo.health.getSessionRow(imports.find((s) => s.startTime === a.at(3))!.id)!;
    expect(restoredImport).toMatchObject({ is_health_imported: 1, health_import_detached: 1 });
    expect(b.repo.health.linksFor(restoredImport.id)).toEqual([]);

    // turn health connect on: full read, export, two more pulls
    b.settings.set('healthSyncEnabled', true);
    await b.engine.sync('full');
    await b.engine.sync('full');
    await b.engine.sync('forceResync');
    const sessions = b.repo.listValidSessions();
    expect(sessions.map((s) => s.id).sort()).toEqual([owned.id, restoredImport.id].sort());
    expect(b.repo.health.linksFor(restoredImport.id)).toHaveLength(1);
    // the owned night replaced its old record in place (stable client record id, higher version)
    expect(hc.ownRecords()).toHaveLength(1);
    expect(hc.ownRecords()[0].clientRecordId).toBe(clientRecordIdFor(owned.id));
    expect(hc.ownRecords()[0].clientRecordVersion).toBe(b.repo.getSession(owned.id)!.health!.syncVersion);
  });
});
