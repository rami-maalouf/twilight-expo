// versioned migration (docs/health-connect.md 3.2, 7.1)
import { memoryDb } from '../../../tests/helpers/memory-db';
import { inTransaction, migrate, SCHEMA_VERSION, schemaVersion } from '../db';

const T0 = Date.UTC(2025, 0, 15, 5, 0, 0);

// the schema as shipped before versioning (user_version 0)
function legacyDb() {
  const db = memoryDb();
  db.execSync(`
    create table if not exists sleep_sessions (
      id text primary key not null, tag text not null, start_time integer not null,
      end_time integer, start_tz text not null, end_tz text,
      created_at integer not null, updated_at integer not null
    );
  `);
  db.runSync('insert into sleep_sessions values (?, ?, ?, ?, ?, ?, ?, ?)', [
    'old-1', 'Manual Log', T0, T0 + 8 * 3600_000, 'Europe/Paris', 'Europe/Paris', T0, T0,
  ]);
  return db;
}

describe('migrate', () => {
  test('v0 -> v2 keeps rows and sets sync defaults with a clock version', () => {
    const db = legacyDb();
    const now = T0 + 86_400_000;
    migrate(db, now);
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
    const row = db.getFirstSync<Record<string, unknown>>('select * from sleep_sessions where id = ?', ['old-1']);
    expect(row).toMatchObject({
      tag: 'Manual Log',
      start_time: T0,
      is_health_imported: 0,
      health_adopted: 0,
      needs_health_sync: 1,
      health_sync_version: now,
      hc_written: 0,
      hc_remote_deleted: 0,
      hc_record_id: null,
    });
    for (const table of ['health_tombstones', 'hc_deleted_sessions', 'hc_records', 'hc_import_links', 'hc_pending_deletions', 'health_sync_state']) {
      expect(db.getAllSync(`select * from ${table}`, [])).toEqual([]);
    }
  });

  test('re-running is a no-op', () => {
    const db = legacyDb();
    migrate(db, T0 + 1);
    migrate(db, T0 + 999);
    expect(db.getFirstSync<{ v: number }>('select health_sync_version as v from sleep_sessions', [])?.v).toBe(T0 + 1);
  });

  test('a fresh database migrates straight to the current version', () => {
    const db = memoryDb();
    migrate(db);
    expect(schemaVersion(db)).toBe(SCHEMA_VERSION);
  });

  test('inTransaction rolls back on throw and joins nested calls', () => {
    const db = memoryDb();
    migrate(db);
    expect(() =>
      inTransaction(db, () => {
        db.runSync("insert into health_sync_state values ('a', '1')", []);
        inTransaction(db, () => db.runSync("insert into health_sync_state values ('b', '2')", []));
        throw new Error('boom');
      })
    ).toThrow('boom');
    expect(db.getAllSync('select * from health_sync_state', [])).toEqual([]);
  });
});
