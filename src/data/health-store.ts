// all sql for health sync: session sync columns, foreign mirror, import links,
// tombstones, deletion ledger, deletion outbox and sync state
// (docs/health-connect.md 3.2, 3.4). every multi-row change is one transaction.
import { clusterNights, tagForRecordingMethod, type OwnOrphan } from '../domain/health/clusterer';
import type { InboundPlan } from '../domain/health/inbound';
import { intervalsOverlap } from '../domain/health/reconciler';
import { clientRecordIdFor, isDemoSession } from '../domain/health/ownership';
import {
  classifyRemoteOwnDeletion,
  isEndedValid,
  isOwnedForExport,
  learnOwnRecord,
  nextSyncVersion,
  type LocalOwnState,
  type OutboundSessionRow,
  type RemoteOwnRecord,
} from '../domain/health/outbound';
import {
  HEALTH_CONNECT_IMPORT_TAG,
  HEALTH_PAYLOAD_MIN_VERSION,
  type HealthProvider,
  type HealthRecord,
  type LocalSessionSnapshot,
  type MirrorRecord,
  type Tombstone,
} from '../domain/health/types';
import { zoneForOffset } from '../domain/health/zones';
import { inTransaction, type SqlDatabase, type SqlParam } from './db';
import { makeId } from './ids';

export interface HealthSessionRow {
  id: string;
  tag: string;
  start_time: number;
  end_time: number | null;
  start_tz: string;
  end_tz: string | null;
  created_at: number;
  updated_at: number;
  is_health_imported: number;
  health_adopted: number;
  health_import_detached: number;
  health_provider: HealthProvider | null;
  health_night_key: string | null;
  health_source_id: string | null;
  needs_health_sync: number;
  health_sync_version: number;
  hc_record_id: string | null;
  hc_remote_version: number | null;
  hc_written: number;
  hc_remote_deleted: number;
  hc_error_code: string | null;
  hc_error_version: number | null;
}

export interface OutboxRow {
  client_record_id: string;
  session_id: string;
  hc_record_id: string | null;
  start_ms: number;
  end_ms: number;
  attempts: number;
  last_error: string | null;
  created_at: number;
}

export type SyncStateKey =
  | 'installId'
  | 'changesToken'
  | 'firstGrantedAt'
  | 'permissionRequestedAt'
  | 'lastFullReadAt'
  | 'lastSuccessAt'
  | 'lastError'
  | 'lastPullResult'
  | 'heldRemoteDeletions'
  | 'payloadRevision';

export function toOutboundRow(row: HealthSessionRow): OutboundSessionRow {
  return {
    id: row.id,
    tag: row.tag,
    startMs: row.start_time,
    endMs: row.end_time,
    startZone: row.start_tz,
    endZone: row.end_tz,
    imported: row.is_health_imported === 1,
    adopted: row.health_adopted === 1,
    provider: row.health_provider,
    needsSync: row.needs_health_sync === 1,
    syncVersion: row.health_sync_version,
    hcWritten: row.hc_written === 1,
    hcRemoteDeleted: row.hc_remote_deleted === 1,
    hcErrorCode: row.hc_error_code,
    hcErrorVersion: row.hc_error_version,
  };
}

export function toOwnState(row: HealthSessionRow): LocalOwnState {
  return {
    syncVersion: row.health_sync_version,
    hcRemoteVersion: row.hc_remote_version,
    startMs: row.start_time,
    endMs: row.end_time,
    startZone: row.start_tz,
    endZone: row.end_tz,
  };
}

export function toRemoteOwn(record: HealthRecord): RemoteOwnRecord {
  return {
    version: record.clientRecordVersion,
    startMs: record.startMs,
    endMs: record.endMs,
    startOffsetSec: record.startOffsetSec,
    endOffsetSec: record.endOffsetSec,
  };
}

interface MirrorRow {
  record_id: string;
  data_origin: string;
  client_record_id: string | null;
  start_time: number;
  end_time: number;
  start_offset: number | null;
  end_offset: number | null;
  last_modified: number;
  stages: string;
}

function parseIds(json: string): string[] {
  try {
    const value: unknown = JSON.parse(json);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

export class HealthStore {
  constructor(private readonly db: SqlDatabase) {}

  tx<T>(fn: () => T): T {
    return inTransaction(this.db, fn);
  }

  // sync state

  getState(key: SyncStateKey): string | null {
    return this.db.getFirstSync<{ value: string }>('select value from health_sync_state where key = ?', [key])?.value ?? null;
  }

  setState(key: SyncStateKey, value: string | null): void {
    if (value == null) {
      this.db.runSync('delete from health_sync_state where key = ?', [key]);
    } else {
      this.db.runSync('insert or replace into health_sync_state (key, value) values (?, ?)', [key, value]);
    }
  }

  getJson<T>(key: SyncStateKey): T | null {
    const raw = this.getState(key);
    if (raw == null) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  setJson(key: SyncStateKey, value: unknown): void {
    this.setState(key, value == null ? null : JSON.stringify(value));
  }

  heldRemoteDeletions(): string[] {
    const ids = this.getJson<unknown>('heldRemoteDeletions');
    return Array.isArray(ids) ? ids.filter((v): v is string => typeof v === 'string') : [];
  }

  setHeldRemoteDeletions(ids: string[]): void {
    this.setJson('heldRemoteDeletions', ids.length > 0 ? [...new Set(ids)] : null);
  }

  // sessions

  listSessionRows(): HealthSessionRow[] {
    return this.db.getAllSync<HealthSessionRow>('select * from sleep_sessions order by start_time', []);
  }

  getSessionRow(id: string): HealthSessionRow | null {
    return this.db.getFirstSync<HealthSessionRow>('select * from sleep_sessions where id = ?', [id]);
  }

  localSnapshots(): LocalSessionSnapshot[] {
    const links = this.listLinks();
    return this.listSessionRows().map((row) => ({
      id: row.id,
      startMs: row.start_time,
      endMs: row.end_time,
      imported: row.is_health_imported === 1,
      adopted: row.health_adopted === 1,
      detached: row.health_import_detached === 1,
      provider: row.health_provider,
      nightKey: row.health_night_key,
      linkedRecordIds: links.get(row.id) ?? [],
      isDemo: isDemoSession(row),
      startZone: row.start_tz,
      endZone: row.end_tz,
    }));
  }

  // write-ahead: a twilight record may exist from here on (2.5). returns the
  // ids that still exist, so a session deleted meanwhile is never written
  markWritten(ids: readonly string[]): string[] {
    return this.tx(() =>
      ids.filter((id) => {
        if (!this.getSessionRow(id)) return false;
        this.db.runSync('update sleep_sessions set hc_written = 1 where id = ?', [id]);
        return true;
      })
    );
  }

  // compare-and-set: an edit during the write changed the version, so the
  // session stays pending (fixes swift defect 1)
  markSynced(id: string, version: number, recordId: string): boolean {
    this.db.runSync(
      `update sleep_sessions
          set needs_health_sync = 0, hc_record_id = ?, hc_written = 1,
              hc_remote_version = max(coalesce(hc_remote_version, 0), ?),
              hc_error_code = null, hc_error_version = null
        where id = ? and health_sync_version = ?`,
      [recordId, version, id, version]
    );
    const row = this.getSessionRow(id);
    return row != null && row.health_sync_version === version && row.needs_health_sync === 0;
  }

  markPoisoned(id: string, version: number): void {
    this.db.runSync(
      "update sleep_sessions set hc_error_code = 'invalid', hc_error_version = ? where id = ? and health_sync_version = ?",
      [version, id, version]
    );
  }

  bumpPending(id: string, nowMs: number, floor = 0): void {
    const row = this.getSessionRow(id);
    if (!row) return;
    this.db.runSync('update sleep_sessions set needs_health_sync = 1, health_sync_version = ? where id = ?', [
      nextSyncVersion(Math.max(row.health_sync_version, floor), nowMs),
      id,
    ]);
  }

  // owned, ended, valid, not adopted, not remote-deleted, not demo
  exportableRows(): HealthSessionRow[] {
    return this.listSessionRows().filter((row) => {
      const r = toOutboundRow(row);
      return isOwnedForExport(r) && isEndedValid(r) && !r.hcRemoteDeleted;
    });
  }

  markAllExportablePending(nowMs: number): void {
    this.tx(() => {
      for (const row of this.exportableRows()) this.bumpPending(row.id, nowMs);
    });
  }

  // own record seen in health connect: learn its id and version (3.3 self-heal)
  learnOwnRecord(sessionId: string, record: HealthRecord, nowMs: number): void {
    const row = this.getSessionRow(sessionId);
    if (!row) return;
    const out = toOutboundRow(row);
    if (!isOwnedForExport(out) || out.hcRemoteDeleted) return;
    const learning = learnOwnRecord(toOwnState(row), toRemoteOwn(record), nowMs);
    this.db.runSync('update sleep_sessions set hc_record_id = ?, hc_remote_version = ?, hc_written = 1 where id = ?', [
      record.recordId,
      learning.remoteVersion,
      sessionId,
    ]);
    if (learning.bumpTo != null) {
      this.db.runSync('update sleep_sessions set health_sync_version = ?, needs_health_sync = 1 where id = ?', [
        learning.bumpTo,
        sessionId,
      ]);
    }
  }

  sessionIdForRecordId(recordId: string): string | null {
    return this.db.getFirstSync<{ id: string }>('select id from sleep_sessions where hc_record_id = ?', [recordId])?.id ?? null;
  }

  // remote deletion of a twilight record (2.6 policy): never deletes locally
  applyRemoteOwnDeletion(sessionId: string, observedAtMs: number): 'held' | 'agedOut' | null {
    const row = this.getSessionRow(sessionId);
    if (!row) return null;
    this.db.runSync(
      'update sleep_sessions set hc_remote_deleted = 1, hc_record_id = null, hc_written = 0 where id = ?',
      [sessionId]
    );
    const outcome = classifyRemoteOwnDeletion(row.end_time, observedAtMs);
    if (outcome === 'held') this.setHeldRemoteDeletions([...this.heldRemoteDeletions(), sessionId]);
    return outcome;
  }

  // outbox row deleted remotely: the session (if still local) has no record now
  clearWritten(sessionId: string): void {
    this.db.runSync('update sleep_sessions set hc_written = 0, hc_record_id = null where id = ?', [sessionId]);
  }

  insertRehydrated(orphan: OwnOrphan, deviceZone: string, nowMs: number): void {
    const startZone = zoneForOffset(orphan.startOffsetSec, orphan.startMs, deviceZone);
    const endZone = zoneForOffset(orphan.endOffsetSec, orphan.endMs, deviceZone);
    this.db.runSync(
      `insert or ignore into sleep_sessions
         (id, tag, start_time, end_time, start_tz, end_tz, created_at, updated_at,
          needs_health_sync, health_sync_version, hc_record_id, hc_remote_version, hc_written)
       values (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 1)`,
      [
        orphan.sessionId,
        tagForRecordingMethod(orphan.recordingMethod),
        orphan.startMs,
        orphan.endMs,
        startZone,
        endZone,
        nowMs,
        nowMs,
        Math.max(orphan.clientRecordVersion, HEALTH_PAYLOAD_MIN_VERSION),
        orphan.recordId,
        orphan.clientRecordVersion,
      ]
    );
  }

  applyInboundPlan(plan: InboundPlan, nowMs: number): { insertedIds: string[] } {
    return this.tx(() => {
      const insertedIds: string[] = [];
      for (const del of plan.deletes) {
        this.deleteLinks(del.sessionId);
        this.db.runSync('delete from sleep_sessions where id = ? and is_health_imported = 1', [del.sessionId]);
      }
      for (const id of plan.detaches) {
        this.deleteLinks(id);
        this.db.runSync('update sleep_sessions set health_import_detached = 1 where id = ?', [id]);
      }
      for (const up of plan.updates) {
        if (up.changed) {
          this.db.runSync(
            `update sleep_sessions
                set start_time = ?, end_time = ?, start_tz = ?, end_tz = ?, health_night_key = ?,
                    health_source_id = ?, updated_at = ?
              where id = ? and is_health_imported = 1`,
            [up.night.startMs, up.night.endMs, up.startZone, up.endZone, up.night.nightKey, up.night.source, nowMs, up.sessionId]
          );
        }
        this.db.runSync('update sleep_sessions set health_import_detached = 0 where id = ?', [up.sessionId]);
        this.setLinks(up.sessionId, up.night.recordIds);
      }
      for (const ins of plan.inserts) {
        const id = makeId();
        this.db.runSync(
          `insert into sleep_sessions
             (id, tag, start_time, end_time, start_tz, end_tz, created_at, updated_at,
              is_health_imported, health_provider, health_night_key, health_source_id,
              needs_health_sync, health_sync_version)
           values (?, ?, ?, ?, ?, ?, ?, ?, 1, 'health_connect', ?, ?, 0, ?)`,
          [
            id,
            HEALTH_CONNECT_IMPORT_TAG,
            ins.night.startMs,
            ins.night.endMs,
            ins.startZone,
            ins.endZone,
            nowMs,
            nowMs,
            ins.night.nightKey,
            ins.night.source,
            HEALTH_PAYLOAD_MIN_VERSION,
          ]
        );
        this.setLinks(id, ins.night.recordIds);
        insertedIds.push(id);
      }
      return { insertedIds };
    });
  }

  // device restore or first run (4.6): drop everything bound to another hc store
  resetDeviceState(nowMs: number): void {
    this.tx(() => {
      for (const key of ['changesToken', 'firstGrantedAt', 'heldRemoteDeletions', 'lastFullReadAt'] as const) {
        this.setState(key, null);
      }
      this.db.execSync('delete from hc_records; delete from hc_import_links;');
      this.db.runSync(
        `update sleep_sessions set hc_record_id = null, hc_remote_version = null, hc_written = 0, hc_remote_deleted = 0`,
        []
      );
      this.db.runSync(
        "update sleep_sessions set health_import_detached = 1 where is_health_imported = 1 and health_provider = 'health_connect'",
        []
      );
      this.db.runSync('update hc_pending_deletions set attempts = 0', []);
      for (const row of this.exportableRows()) this.bumpPending(row.id, nowMs);
    });
  }

  // mirror

  listMirror(): MirrorRecord[] {
    return this.db.getAllSync<MirrorRow>('select * from hc_records order by start_time', []).map((r) => ({
      recordId: r.record_id,
      dataOrigin: r.data_origin,
      clientRecordId: r.client_record_id,
      startMs: r.start_time,
      endMs: r.end_time,
      startOffsetSec: r.start_offset,
      endOffsetSec: r.end_offset,
      lastModifiedMs: r.last_modified,
      stages: (() => {
        try {
          const v: unknown = JSON.parse(r.stages);
          return Array.isArray(v) ? (v as MirrorRecord['stages']) : [];
        } catch {
          return [];
        }
      })(),
    }));
  }

  upsertMirror(record: MirrorRecord): void {
    this.db.runSync('insert or replace into hc_records values (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
      record.recordId,
      record.dataOrigin,
      record.clientRecordId,
      record.startMs,
      record.endMs,
      record.startOffsetSec,
      record.endOffsetSec,
      record.lastModifiedMs,
      JSON.stringify(record.stages.map((s) => ({ startMs: s.startMs, endMs: s.endMs, type: s.type }))),
    ]);
  }

  deleteMirror(recordId: string): void {
    this.db.runSync('delete from hc_records where record_id = ?', [recordId]);
  }

  replaceMirror(records: readonly MirrorRecord[]): void {
    this.tx(() => {
      this.clearMirror();
      for (const r of records) this.upsertMirror(r);
    });
  }

  clearMirror(): void {
    this.db.runSync('delete from hc_records', []);
  }

  // links (swift importedSampleUUIDs)

  listLinks(): Map<string, string[]> {
    const map = new Map<string, string[]>();
    for (const row of this.db.getAllSync<{ session_id: string; record_id: string }>(
      'select session_id, record_id from hc_import_links order by record_id',
      []
    )) {
      map.set(row.session_id, [...(map.get(row.session_id) ?? []), row.record_id]);
    }
    return map;
  }

  linksFor(sessionId: string): string[] {
    return this.db
      .getAllSync<{ record_id: string }>('select record_id from hc_import_links where session_id = ? order by record_id', [sessionId])
      .map((r) => r.record_id);
  }

  setLinks(sessionId: string, recordIds: readonly string[]): void {
    this.deleteLinks(sessionId);
    for (const id of recordIds) {
      this.db.runSync('insert or ignore into hc_import_links (session_id, record_id) values (?, ?)', [sessionId, id]);
    }
  }

  deleteLinks(sessionId: string): void {
    this.db.runSync('delete from hc_import_links where session_id = ?', [sessionId]);
  }

  // tombstones

  listTombstones(): Tombstone[] {
    return this.db
      .getAllSync<{ night_key: string; deleted_at: number; record_ids: string }>('select * from health_tombstones', [])
      .map((r) => ({ nightKey: r.night_key, deletedAt: r.deleted_at, recordIds: parseIds(r.record_ids) }));
  }

  // existing keys keep their date; record ids are merged
  upsertTombstone(nightKey: string, recordIds: readonly string[], deletedAt: number): void {
    const existing = this.listTombstones().find((t) => t.nightKey === nightKey);
    const ids = [...new Set([...(existing?.recordIds ?? []), ...recordIds])].sort();
    this.db.runSync('insert or replace into health_tombstones (night_key, deleted_at, record_ids) values (?, ?, ?)', [
      nightKey,
      existing?.deletedAt ?? deletedAt,
      JSON.stringify(ids),
    ]);
  }

  // record ids of every mirror night that overlaps an interval (2.6: the
  // other apps' copies of a deleted import must not come back)
  overlappingMirrorRecordIds(startMs: number, endMs: number | null): string[] {
    return clusterNights(this.listMirror(), { deviceZone: 'UTC' })
      .filter((n) => intervalsOverlap(n.startMs, n.endMs, startMs, endMs))
      .flatMap((n) => n.recordIds);
  }

  // deletion ledger

  deletedSessionIds(): Set<string> {
    return new Set(
      this.db.getAllSync<{ session_id: string }>('select session_id from hc_deleted_sessions', []).map((r) => r.session_id)
    );
  }

  addToLedger(sessionId: string, deletedAt: number): void {
    this.db.runSync('insert or ignore into hc_deleted_sessions (session_id, deleted_at) values (?, ?)', [sessionId, deletedAt]);
  }

  removeFromLedger(sessionIds: readonly string[]): void {
    for (const id of sessionIds) this.db.runSync('delete from hc_deleted_sessions where session_id = ?', [id]);
  }

  // deletion outbox

  listOutbox(): OutboxRow[] {
    return this.db.getAllSync<OutboxRow>('select * from hc_pending_deletions order by created_at, client_record_id', []);
  }

  enqueueDeletion(row: HealthSessionRow, nowMs: number): void {
    this.db.runSync(
      `insert or ignore into hc_pending_deletions
         (client_record_id, session_id, hc_record_id, start_ms, end_ms, attempts, created_at)
       values (?, ?, ?, ?, ?, 0, ?)`,
      [clientRecordIdFor(row.id), row.id, row.hc_record_id, row.start_time, row.end_time ?? row.start_time, nowMs]
    );
  }

  removeOutbox(clientRecordId: string): void {
    this.db.runSync('delete from hc_pending_deletions where client_record_id = ?', [clientRecordId]);
  }

  recordOutboxFailure(clientRecordId: string, error: string): void {
    this.db.runSync(
      'update hc_pending_deletions set attempts = attempts + 1, last_error = ? where client_record_id = ?',
      [error, clientRecordId]
    );
  }

  run(sql: string, params: SqlParam[] = []): void {
    this.db.runSync(sql, params);
  }
}
