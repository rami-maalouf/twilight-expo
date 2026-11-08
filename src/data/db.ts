// sqlite schema for twilight.db (spec data-model section, docs/health-connect.md 3.2).
// the interface is the structural subset of expo-sqlite's SQLiteDatabase the
// repositories use, so tests can drive the same sql through node:sqlite.

export type SqlParam = string | number | null;

export interface SqlDatabase {
  execSync(sql: string): void;
  runSync(sql: string, params: SqlParam[]): void;
  getAllSync<T>(sql: string, params: SqlParam[]): T[];
  getFirstSync<T>(sql: string, params: SqlParam[]): T | null;
  withTransactionSync(task: () => void): void;
}

export const SCHEMA_VERSION = 2;

const depth = new WeakMap<SqlDatabase, number>();

// one sqlite transaction; nested calls join the outer one (expo-sqlite cannot nest)
export function inTransaction<T>(db: SqlDatabase, fn: () => T): T {
  if ((depth.get(db) ?? 0) > 0) return fn();
  let result!: T;
  depth.set(db, 1);
  try {
    db.withTransactionSync(() => {
      result = fn();
    });
  } finally {
    depth.set(db, 0);
  }
  return result;
}

const V1 = `
  create table if not exists sleep_sessions (
    id text primary key not null,
    tag text not null,
    start_time integer not null,
    end_time integer,
    start_tz text not null,
    end_tz text,
    created_at integer not null,
    updated_at integer not null
  );
  create index if not exists idx_sessions_end_time on sleep_sessions(end_time);
`;

// health sync ownership columns and tables (docs/health-connect.md 3.2)
const V2 = `
  alter table sleep_sessions add column is_health_imported integer not null default 0;
  alter table sleep_sessions add column health_adopted integer not null default 0;
  alter table sleep_sessions add column health_import_detached integer not null default 0;
  alter table sleep_sessions add column health_provider text;
  alter table sleep_sessions add column health_night_key text;
  alter table sleep_sessions add column health_source_id text;
  alter table sleep_sessions add column needs_health_sync integer not null default 1;
  alter table sleep_sessions add column health_sync_version integer not null default 2;
  alter table sleep_sessions add column hc_record_id text;
  alter table sleep_sessions add column hc_remote_version integer;
  alter table sleep_sessions add column hc_written integer not null default 0;
  alter table sleep_sessions add column hc_remote_deleted integer not null default 0;
  alter table sleep_sessions add column hc_error_code text;
  alter table sleep_sessions add column hc_error_version integer;

  create table if not exists health_tombstones (
    night_key text primary key not null,
    deleted_at integer not null,
    record_ids text not null default '[]'
  );
  create table if not exists hc_deleted_sessions (
    session_id text primary key not null,
    deleted_at integer not null
  );
  create table if not exists hc_records (
    record_id text primary key not null,
    data_origin text not null,
    client_record_id text,
    start_time integer not null,
    end_time integer not null,
    start_offset integer,
    end_offset integer,
    last_modified integer not null,
    stages text not null default '[]'
  );
  create table if not exists hc_import_links (
    session_id text not null,
    record_id text not null,
    primary key (session_id, record_id)
  );
  create table if not exists hc_pending_deletions (
    client_record_id text primary key not null,
    session_id text not null,
    hc_record_id text,
    start_ms integer not null,
    end_ms integer not null,
    attempts integer not null default 0,
    last_error text,
    created_at integer not null
  );
  create table if not exists health_sync_state (key text primary key not null, value text not null);
  create index if not exists idx_sessions_hc_record on sleep_sessions(hc_record_id);
  create index if not exists idx_links_record on hc_import_links(record_id);
`;

export function schemaVersion(db: SqlDatabase): number {
  return db.getFirstSync<{ user_version: number }>('pragma user_version', [])?.user_version ?? 0;
}

// versioned runner over pragma user_version. step 1 is the original
// idempotent schema, so databases created before versioning start at 0.
export function migrate(db: SqlDatabase, nowMs = Date.now()): void {
  const version = schemaVersion(db);
  if (version < 1) {
    inTransaction(db, () => {
      db.execSync(V1);
      db.execSync('pragma user_version = 1');
    });
  }
  if (version < 2) {
    inTransaction(db, () => {
      db.execSync(V2);
      // a clock version, not 2: a record an earlier install left in health
      // connect must never silently win over the existing journal (3.3)
      db.runSync('update sleep_sessions set needs_health_sync = 1, health_sync_version = ?', [
        Math.floor(nowMs),
      ]);
      db.execSync(`pragma user_version = ${SCHEMA_VERSION}`);
    });
  }
}
