// session mutations and their health sync bookkeeping (docs/health-connect.md 3.3, 3.4, 2.6, 4.4)
import { memoryDb } from '../../../tests/helpers/memory-db';
import { createDemoSleepSessions, DEMO_SESSION_ID_PREFIX } from '../../demo/demo-mode';
import { migrate } from '../db';
import { SessionRepo } from '../session-repo';

const T0 = Date.UTC(2026, 10, 1, 22, 0);
const H = 3600_000;

function setup() {
  const db = memoryDb();
  migrate(db, T0 - H);
  const repo = new SessionRepo(db);
  const log = (offsetH = 0, nowMs = T0 + 9 * H) =>
    repo.createManualLog({
      startTime: T0 + offsetH * H,
      endTime: T0 + (offsetH + 8) * H,
      startTimeZone: 'Europe/Paris',
      endTimeZone: 'Europe/Paris',
      nowMs,
    });
  // an hc import as the inbound plan writes it
  const importNight = (id: string, startMs: number, endMs: number, recordIds: string[]) => {
    db.runSync(
      `insert into sleep_sessions (id, tag, start_time, end_time, start_tz, end_tz, created_at, updated_at,
         is_health_imported, health_provider, health_night_key, health_source_id, needs_health_sync)
       values (?, 'Health Connect', ?, ?, 'UTC', 'UTC', 0, 0, 1, 'health_connect', ?, 'com.watch', 0)`,
      [id, startMs, endMs, `com.watch|key|${id}`]
    );
    repo.health.setLinks(id, recordIds);
  };
  return { db, repo, log, importNight };
}

describe('session repo health hooks', () => {
  test('new sessions are pending with a clock version', () => {
    const { log } = setup();
    const s = log();
    expect(s.health).toMatchObject({ needsSync: true, syncVersion: T0 + 9 * H, imported: false, adopted: false });
  });

  test('ending a tracked session bumps the version and marks it pending', () => {
    const { repo } = setup();
    repo.startSession('Sleep Mode', 'Europe/Paris', T0);
    const ended = repo.endActiveSession('Europe/Paris', T0 + 8 * H)!;
    expect(ended.health).toMatchObject({ needsSync: true, syncVersion: T0 + 8 * H });
  });

  test('edit bumps the version every time, even while already pending', () => {
    const { repo, log } = setup();
    const s = log();
    const edit = (nowMs: number) =>
      repo.updateSession(s.id, { startTime: T0, endTime: T0 + 7 * H, startTimeZone: 'Europe/Paris', endTimeZone: 'Europe/Paris', nowMs });
    edit(T0 + 10 * H);
    const v1 = repo.getSession(s.id)!.health!.syncVersion;
    // clock went backwards: still strictly increasing
    edit(T0);
    const v2 = repo.getSession(s.id)!.health!.syncVersion;
    expect(v1).toBe(T0 + 10 * H);
    expect(v2).toBe(v1 + 1);
  });

  test('compare-and-set mark fails after a concurrent edit', () => {
    const { repo, log } = setup();
    const s = log();
    const version = s.health!.syncVersion;
    repo.updateSession(s.id, { startTime: T0, endTime: T0 + 7 * H, startTimeZone: 'UTC', endTimeZone: 'UTC', nowMs: T0 + 20 * H });
    expect(repo.health.markSynced(s.id, version, 'rec-1')).toBe(false);
    expect(repo.getSession(s.id)!.health!.needsSync).toBe(true);
    const current = repo.getSession(s.id)!.health!.syncVersion;
    expect(repo.health.markSynced(s.id, current, 'rec-1')).toBe(true);
    expect(repo.getSession(s.id)!.health).toMatchObject({ needsSync: false, hcRecordId: 'rec-1', hcRemoteVersion: current });
  });

  test('an edit clears the remote-deleted flag and the poison marker', () => {
    const { db, repo, log } = setup();
    const s = log();
    db.runSync("update sleep_sessions set hc_remote_deleted = 1, hc_error_code = 'invalid', hc_error_version = 5 where id = ?", [s.id]);
    repo.updateSession(s.id, { startTime: T0, endTime: T0 + 7 * H, startTimeZone: 'UTC', endTimeZone: 'UTC', nowMs: T0 + 20 * H });
    expect(repo.health.getSessionRow(s.id)).toMatchObject({ hc_remote_deleted: 0, hc_error_code: null, hc_error_version: null });
  });

  test('editing an import adopts it: owned locally, key and links kept, never pending', () => {
    const { repo, importNight } = setup();
    importNight('imp', T0, T0 + 8 * H, ['r1', 'r2']);
    repo.updateSession('imp', { startTime: T0 + H, endTime: T0 + 8 * H, startTimeZone: 'UTC', endTimeZone: 'UTC', nowMs: T0 + 20 * H });
    expect(repo.getSession('imp')!.health).toMatchObject({ imported: false, adopted: true, nightKey: 'com.watch|key|imp', needsSync: false });
    expect(repo.health.linksFor('imp')).toEqual(['r1', 'r2']);
  });

  test('delete owned written -> outbox + ledger rows', () => {
    const { db, repo, log } = setup();
    const s = log();
    db.runSync("update sleep_sessions set hc_written = 1, hc_record_id = 'rec-9' where id = ?", [s.id]);
    repo.deleteSession(s.id, T0 + 30 * H);
    expect(repo.getSession(s.id)).toBeNull();
    expect(repo.health.deletedSessionIds()).toEqual(new Set([s.id]));
    expect(repo.health.listOutbox()).toEqual([
      expect.objectContaining({
        client_record_id: `twilight.sleep-session.${s.id}`,
        session_id: s.id,
        hc_record_id: 'rec-9',
        start_ms: T0,
        end_ms: T0 + 8 * H,
        attempts: 0,
      }),
    ]);
  });

  test('delete owned never written -> ledger row only', () => {
    const { repo, log } = setup();
    const s = log();
    repo.deleteSession(s.id, T0 + 30 * H);
    expect(repo.health.deletedSessionIds()).toEqual(new Set([s.id]));
    expect(repo.health.listOutbox()).toEqual([]);
  });

  test('delete import -> tombstone with linked and other-source record ids, no ledger or outbox', () => {
    const { repo, importNight } = setup();
    importNight('imp', T0, T0 + 8 * H, ['w1']);
    repo.health.upsertMirror({ recordId: 'w1', dataOrigin: 'com.watch', clientRecordId: null, startMs: T0, endMs: T0 + 8 * H, startOffsetSec: 0, endOffsetSec: 0, lastModifiedMs: 0, stages: [] });
    repo.health.upsertMirror({ recordId: 'b1', dataOrigin: 'com.other', clientRecordId: null, startMs: T0 + H, endMs: T0 + 7 * H, startOffsetSec: 0, endOffsetSec: 0, lastModifiedMs: 0, stages: [] });
    repo.health.upsertMirror({ recordId: 'far', dataOrigin: 'com.other', clientRecordId: null, startMs: T0 + 30 * H, endMs: T0 + 37 * H, startOffsetSec: 0, endOffsetSec: 0, lastModifiedMs: 0, stages: [] });
    repo.deleteSession('imp', T0 + 40 * H);
    expect(repo.health.listTombstones()).toEqual([{ nightKey: 'com.watch|key|imp', deletedAt: T0 + 40 * H, recordIds: ['b1', 'w1'] }]);
    expect(repo.health.deletedSessionIds().size).toBe(0);
    expect(repo.health.listOutbox()).toEqual([]);
    expect(repo.health.linksFor('imp')).toEqual([]);
  });

  test('delete adopted -> tombstone, no ledger and no outbox row', () => {
    const { repo, importNight } = setup();
    importNight('imp', T0, T0 + 8 * H, ['w1']);
    repo.updateSession('imp', { startTime: T0 + H, endTime: T0 + 8 * H, startTimeZone: 'UTC', endTimeZone: 'UTC', nowMs: T0 + 20 * H });
    repo.deleteSession('imp', T0 + 40 * H);
    expect(repo.health.listTombstones().map((t) => t.recordIds)).toEqual([['w1']]);
    expect(repo.health.deletedSessionIds().size).toBe(0);
    expect(repo.health.listOutbox()).toEqual([]);
  });

  test('demo exit bulk delete writes no ledger, outbox or tombstone rows', () => {
    const { db, repo } = setup();
    repo.replaceSessionsWithPrefix(DEMO_SESSION_ID_PREFIX, createDemoSleepSessions(T0));
    db.runSync('update sleep_sessions set hc_written = 1', []);
    repo.deleteSessionsWithPrefix(DEMO_SESSION_ID_PREFIX);
    expect(repo.listValidSessions()).toEqual([]);
    expect(repo.health.deletedSessionIds().size).toBe(0);
    expect(repo.health.listOutbox()).toEqual([]);
    expect(repo.health.listTombstones()).toEqual([]);
  });

  test('deleting one demo session writes no rows either', () => {
    const { db, repo } = setup();
    repo.replaceSessionsWithPrefix(DEMO_SESSION_ID_PREFIX, createDemoSleepSessions(T0).slice(0, 1));
    db.runSync('update sleep_sessions set hc_written = 1', []);
    repo.deleteSession(`${DEMO_SESSION_ID_PREFIX}1`);
    expect(repo.health.deletedSessionIds().size).toBe(0);
    expect(repo.health.listOutbox()).toEqual([]);
  });

  test('tombstones merge record ids and keep the first deletion date', () => {
    const { repo } = setup();
    repo.health.upsertTombstone('k', ['a'], 1);
    repo.health.upsertTombstone('k', ['b', 'a'], 2);
    expect(repo.health.listTombstones()).toEqual([{ nightKey: 'k', deletedAt: 1, recordIds: ['a', 'b'] }]);
  });
});
