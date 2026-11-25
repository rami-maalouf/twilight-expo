// ports: the sqlite side of DataArchiveManager.swift (makeArchive,
// importArchive) for docs/health-connect.md 6.1 and 6.4. device-bound health
// connect state (record ids, hc_written, mirror, links, token) is never
// exported and never taken from a file.
import type { ArchivedSession } from '../domain/archive/archive-format';
import type { ImportPlan } from '../domain/archive/archive-merge';
import { isDemoSession } from '../domain/health/ownership';
import type { Tombstone } from '../domain/health/types';
import { inTransaction, type SqlDatabase } from './db';
import { HealthStore, type HealthSessionRow } from './health-store';

function toArchived(row: HealthSessionRow): ArchivedSession {
  return {
    id: row.id,
    tag: row.tag,
    startTime: row.start_time,
    endTime: row.end_time,
    startTimeZone: row.start_tz,
    endTimeZone: row.end_tz,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    needsHealthSync: row.needs_health_sync === 1,
    healthSyncVersion: row.health_sync_version,
    imported: row.is_health_imported === 1,
    adopted: row.health_adopted === 1,
    provider: row.health_provider,
    nightKey: row.health_night_key,
    sourceId: row.health_source_id,
  };
}

const CONTENT_COLUMNS = [
  'tag',
  'start_time',
  'end_time',
  'start_tz',
  'end_tz',
  'created_at',
  'updated_at',
  'is_health_imported',
  'health_adopted',
  'health_import_detached',
  'health_provider',
  'health_night_key',
  'health_source_id',
  'needs_health_sync',
  'health_sync_version',
] as const;

export class ArchiveRepo {
  private readonly health: HealthStore;

  constructor(private readonly db: SqlDatabase) {
    this.health = new HealthStore(db);
  }

  // every real session, oldest first; demo sessions never leave the device (4.4)
  listSessions(): ArchivedSession[] {
    return this.health
      .listSessionRows()
      .filter((row) => !isDemoSession(row))
      .map(toArchived);
  }

  listTombstones(): Tombstone[] {
    return this.health.listTombstones().sort((a, b) => a.nightKey.localeCompare(b.nightKey));
  }

  // one transaction (6.4 step 3): upsert sessions by id, union tombstones,
  // and forget the deletion ledger and pending remote deletes of every
  // restored id (a restore is an explicit act that brings those nights back)
  applyImport(plan: ImportPlan): void {
    inTransaction(this.db, () => {
      for (const s of plan.inserts) {
        // a restored import has no links in this store: detached until a
        // mirror night matches its key, so the absence rule never deletes it
        const values = this.contentValues(s, s.imported && s.provider === 'health_connect');
        this.db.runSync(
          `insert into sleep_sessions (id, ${CONTENT_COLUMNS.join(', ')})
           values (?, ${CONTENT_COLUMNS.map(() => '?').join(', ')})`,
          [s.id, ...values]
        );
      }
      for (const s of plan.updates) {
        const row = this.health.getSessionRow(s.id);
        if (!row) continue;
        const detached = s.imported && (row.is_health_imported === 0 || row.health_import_detached === 1);
        // links belong to imports and adopted imports (2.5); an owned night has none
        if (!s.imported && !s.adopted) this.health.deleteLinks(s.id);
        this.db.runSync(
          `update sleep_sessions set ${CONTENT_COLUMNS.map((c) => `${c} = ?`).join(', ')} where id = ?`,
          [...this.contentValues(s, detached), s.id]
        );
      }
      for (const t of plan.tombstones) this.health.upsertTombstone(t.nightKey, t.recordIds, t.deletedAt);
      const restored = [...plan.inserts, ...plan.updates].map((s) => s.id);
      this.health.removeFromLedger(restored);
      for (const id of restored) this.health.dropOutboxForSession(id);
      // a restore that changes an owned night is an explicit edit (2.6 rule 5):
      // it ends a held or kept remote deletion and the night exports again
      for (const s of plan.updates) {
        if (s.needsHealthSync) this.db.runSync('update sleep_sessions set hc_remote_deleted = 0 where id = ?', [s.id]);
      }
      this.health.releaseHeldRemoteDeletions(restored);
    });
  }

  private contentValues(s: ArchivedSession, detached: boolean) {
    return [
      s.tag,
      s.startTime,
      s.endTime,
      s.startTimeZone,
      s.endTimeZone,
      s.createdAt,
      s.updatedAt,
      s.imported ? 1 : 0,
      s.adopted ? 1 : 0,
      detached ? 1 : 0,
      s.provider,
      s.nightKey,
      s.sourceId,
      s.needsHealthSync ? 1 : 0,
      s.healthSyncVersion,
    ];
  }
}
