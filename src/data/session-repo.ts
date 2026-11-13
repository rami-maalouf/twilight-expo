// ports: Models/BlockedProfileSessions.swift (create/end/find/recentInactiveSessions,
// markHealthKitSyncPending, adoptFromHealthKitImport) and
// HealthKitSleepSyncManager.handleLocalDeletion (docs/health-connect.md 3.3, 3.4)
// persistence swap: SwiftData -> expo-sqlite (spec decision)
import { isDemoSession } from '../domain/health/ownership';
import { isEndedValid, nextSyncVersion } from '../domain/health/outbound';
import type { SessionHealth, SleepSession } from '../domain/models';
import { MINIMUM_SESSION_SECONDS } from '../domain/session-rules';
import { inTransaction, type SqlDatabase } from './db';
import { HealthStore, type HealthSessionRow } from './health-store';
import { makeId } from './ids';

function toHealth(row: HealthSessionRow): SessionHealth {
  return {
    imported: row.is_health_imported === 1,
    adopted: row.health_adopted === 1,
    provider: row.health_provider,
    nightKey: row.health_night_key,
    sourceId: row.health_source_id,
    needsSync: row.needs_health_sync === 1,
    syncVersion: row.health_sync_version,
    hcRecordId: row.hc_record_id,
    hcRemoteVersion: row.hc_remote_version,
  };
}

function toSession(row: HealthSessionRow): SleepSession {
  return {
    id: row.id,
    tag: row.tag,
    startTime: row.start_time,
    endTime: row.end_time,
    startTimeZone: row.start_tz,
    endTimeZone: row.end_tz,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    health: toHealth(row),
  };
}

export interface SessionTimesInput {
  startTime: number;
  endTime: number;
  startTimeZone: string;
  endTimeZone: string;
  nowMs?: number;
}

export class SessionRepo {
  readonly health: HealthStore;

  constructor(private readonly db: SqlDatabase) {
    this.health = new HealthStore(db);
  }

  getActiveSession(): SleepSession | null {
    const row = this.db.getFirstSync<HealthSessionRow>(
      'select * from sleep_sessions where end_time is null order by start_time desc limit 1',
      []
    );
    return row ? toSession(row) : null;
  }

  // exactly one active session may exist (spec invariant)
  startSession(tag: string, startTimeZone: string, nowMs = Date.now()): SleepSession {
    if (this.getActiveSession()) {
      throw new Error('an active session already exists');
    }
    const id = makeId();
    this.insert({
      id,
      tag,
      startTime: nowMs,
      endTime: null,
      startTimeZone,
      endTimeZone: null,
      createdAt: nowMs,
      updatedAt: nowMs,
    });
    return this.getSession(id)!;
  }

  // a tracked night is complete: export it (swift endSession -> syncSessionIfNeeded)
  endActiveSession(endTimeZone: string, nowMs = Date.now()): SleepSession | null {
    const active = this.getActiveSession();
    if (!active) return null;
    this.db.runSync(
      `update sleep_sessions
          set end_time = ?, end_tz = ?, updated_at = ?, needs_health_sync = 1, health_sync_version = ?
        where id = ?`,
      [nowMs, endTimeZone, nowMs, nextSyncVersion(active.health?.syncVersion ?? 0, nowMs), active.id]
    );
    return this.getSession(active.id);
  }

  createManualLog(input: SessionTimesInput): SleepSession {
    const now = input.nowMs ?? Date.now();
    const id = makeId();
    this.insert({
      id,
      tag: 'Manual Log',
      startTime: input.startTime,
      endTime: input.endTime,
      startTimeZone: input.startTimeZone,
      endTimeZone: input.endTimeZone,
      createdAt: now,
      updatedAt: now,
    });
    return this.getSession(id)!;
  }

  // editor save. an import is adopted ("user edits win"): owned locally,
  // night key and links kept, never written to health connect (2.5). an owned
  // session always gets a new version and pending, and an explicit edit
  // resumes export after a remote deletion or a rejected version (2.6, 3.3).
  // the edit ends a held remote deletion, and an owned night that is valid
  // again cancels its pending remote delete (the record is wanted again)
  updateSession(id: string, input: SessionTimesInput): void {
    inTransaction(this.db, () => this.applyUpdate(id, input));
  }

  private applyUpdate(id: string, input: SessionTimesInput): void {
    const now = input.nowMs ?? Date.now();
    const row = this.health.getSessionRow(id);
    if (!row) return;
    this.health.releaseHeldRemoteDeletions([id]);
    const times = [input.startTime, input.endTime, input.startTimeZone, input.endTimeZone, now];
    const setTimes = 'start_time = ?, end_time = ?, start_tz = ?, end_tz = ?, updated_at = ?';
    if (row.is_health_imported === 1) {
      this.db.runSync(
        `update sleep_sessions set ${setTimes}, is_health_imported = 0, health_adopted = 1,
            health_import_detached = 0, needs_health_sync = 0 where id = ?`,
        [...times, id]
      );
    } else if (row.health_adopted === 1) {
      this.db.runSync(`update sleep_sessions set ${setTimes} where id = ?`, [...times, id]);
    } else {
      this.db.runSync(
        `update sleep_sessions set ${setTimes}, needs_health_sync = 1, health_sync_version = ?,
            hc_remote_deleted = 0, hc_error_code = null, hc_error_version = null where id = ?`,
        [...times, nextSyncVersion(row.health_sync_version, now), id]
      );
      if (isEndedValid({ startMs: input.startTime, endMs: input.endTime })) this.health.dropOutboxForSession(id);
    }
  }

  // one transaction (2.6): tombstone a health night (key, its records, and
  // other apps' overlapping records); for an owned night add a ledger row and,
  // if a twilight record may exist, a remote delete to the outbox. works the
  // same while sync is off, so nothing resurrects later (fixes swift defect 2)
  deleteSession(id: string, nowMs = Date.now()): void {
    inTransaction(this.db, () => {
      const row = this.health.getSessionRow(id);
      if (!row) return;
      if (!isDemoSession(row)) {
        if (row.health_night_key) {
          const ids = [
            ...this.health.linksFor(id),
            ...this.health.overlappingMirrorRecordIds(row.start_time, row.end_time),
          ];
          this.health.upsertTombstone(row.health_night_key, ids, nowMs);
        }
        if (row.is_health_imported === 0 && row.health_adopted === 0) {
          this.health.addToLedger(id, nowMs);
          if (row.hc_written === 1) this.health.enqueueDeletion(row, nowMs);
        }
      }
      this.health.deleteLinks(id);
      this.health.releaseHeldRemoteDeletions([id]);
      this.db.runSync('delete from sleep_sessions where id = ?', [id]);
    });
  }

  // dev "Reset Sleep Data" (swift deletes every session of the profile, the
  // active one included). every row goes through deleteSession, so owned
  // nights get ledger and outbox rows and imports get tombstones: health
  // connect removes twilight's records and nothing comes back on the next pull
  deleteAllSessions(nowMs = Date.now()): void {
    inTransaction(this.db, () => {
      const rows = this.db.getAllSync<{ id: string }>('select id from sleep_sessions', []);
      for (const row of rows) this.deleteSession(row.id, nowMs);
    });
  }

  // demo seed and exit: never ledger, outbox or tombstone rows (4.4)
  replaceSessionsWithPrefix(prefix: string, sessions: readonly SleepSession[]): void {
    inTransaction(this.db, () => {
      this.deleteSessionsWithPrefix(prefix);
      for (const session of sessions) {
        this.insert(session);
      }
    });
  }

  deleteSessionsWithPrefix(prefix: string): void {
    inTransaction(this.db, () => {
      this.db.runSync('delete from hc_import_links where session_id like ?', [`${prefix}%`]);
      this.db.runSync('delete from sleep_sessions where id like ?', [`${prefix}%`]);
    });
  }

  getSession(id: string): SleepSession | null {
    const row = this.health.getSessionRow(id);
    return row ? toSession(row) : null;
  }

  // completed sessions of at least 5 minutes, newest wake first
  // (swift recentInactiveSessions filters isValidSession the same way)
  listValidSessions(): SleepSession[] {
    const rows = this.db.getAllSync<HealthSessionRow>(
      `select * from sleep_sessions
        where end_time is not null and (end_time - start_time) >= ?
        order by end_time desc`,
      [MINIMUM_SESSION_SECONDS * 1000]
    );
    return rows.map(toSession);
  }

  // new sessions are pending with a clock version (3.3)
  private insert(s: SleepSession): void {
    this.db.runSync(
      `insert into sleep_sessions
         (id, tag, start_time, end_time, start_tz, end_tz, created_at, updated_at,
          needs_health_sync, health_sync_version)
       values (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        s.id,
        s.tag,
        s.startTime,
        s.endTime,
        s.startTimeZone,
        s.endTimeZone,
        s.createdAt,
        s.updatedAt,
        nextSyncVersion(0, s.updatedAt),
      ]
    );
  }
}
