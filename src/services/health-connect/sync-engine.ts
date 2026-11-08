// health connect two-way sync orchestration (docs/health-connect.md 4.2, 4.3, 4.6, 4.7).
// ports: HealthKitSleepSyncManager.syncBidirectional / importSleepHistory /
// syncSleepHistory / enableSync / disableSync. all decisions live in
// src/domain/health; this file only sequences adapter calls and transactions.
import { orphanedOwnRecords } from '../../domain/health/clusterer';
import { planInbound } from '../../domain/health/inbound';
import { isOwnRecord, sessionIdFromClientRecordId } from '../../domain/health/ownership';
import {
  isOwnedForExport,
  needsRepair,
  outboxFailureAction,
  planOutbound,
  type PlannedWrite,
} from '../../domain/health/outbound';
import {
  buildPullResult,
  HEALTH_SYNC_ERROR_COPY,
  type HealthSyncErrorCode,
  type HealthSyncSkipReason,
  type PullResult,
} from '../../domain/health/pull-result';
import {
  DELETE_BATCH_SIZE,
  HEALTH_PAYLOAD_REVISION,
  type HealthRecord,
  OUTBOX_ERROR_ATTEMPTS,
  WRITE_BATCH_SIZE,
} from '../../domain/health/types';
import { type OutboxRow, toOutboundRow, toOwnState, toRemoteOwn } from '../../data/health-store';
import type { SessionRepo } from '../../data/session-repo';
import {
  type HcErrorCode,
  type HcStatus,
  type HcWriteResult,
  type HealthConnectAdapter,
  HealthConnectError,
} from './adapter';
import { toHealthConnectError } from './native-adapter';

export type SyncKind = 'push' | 'full' | 'forceResync';

const RANK: Record<SyncKind, number> = { push: 0, full: 1, forceResync: 2 };
const DAY_MS = 24 * 60 * 60 * 1000;
// adapter failures that end the run without per-record retries (2.5, 2.6)
const STOP_CODES = new Set<HcErrorCode>(['E_HC_RATE_LIMIT', 'E_HC_PERMISSION', 'E_HC_IO', 'E_HC_UNAVAILABLE']);

export interface HealthSyncError {
  code: HealthSyncErrorCode;
  message: string;
  at: number;
  sessionId?: string;
  detail?: string;
}

export interface HealthSyncSnapshot {
  status: HcStatus | null;
  enabled: boolean;
  isSyncing: boolean;
  lastError: HealthSyncError | null;
  lastPullResult: PullResult | null;
  lastSuccessAt: number | null;
  heldRemoteDeletions: string[];
}

export interface SyncRunResult {
  kind: SyncKind;
  ran: boolean;
  skipped: HealthSyncSkipReason | null;
  pull: PullResult | null;
  error: HealthSyncError | null;
}

export interface SyncSettings {
  get(key: 'healthSyncEnabled' | 'isDemoDataActive'): boolean;
  set(key: 'healthSyncEnabled', value: boolean): void;
}

export interface SyncEngineDeps {
  adapter: HealthConnectAdapter;
  repo: SessionRepo;
  settings: SyncSettings;
  // reads are foreground-only (2.3); a background run is outbound only (4.3)
  isForeground: () => boolean;
  now?: () => number;
  deviceZone?: () => string;
  onLocalDataChanged?: () => void;
  onSettingsChanged?: () => void;
  onStateChanged?: (snapshot: HealthSyncSnapshot) => void;
  log?: (message: string) => void;
}

// demo became active or sync was turned off while a run awaited the adapter
class SyncAborted extends Error {}

function codeOf(error: unknown): HcErrorCode {
  return toHealthConnectError(error).code;
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export class HealthSyncEngine {
  private running: Promise<SyncRunResult> | null = null;
  private queued: { kind: SyncKind; promise: Promise<SyncRunResult>; resolve: (r: SyncRunResult) => void } | null = null;
  private exclusiveCount = 0;
  private exclusiveTail: Promise<void> = Promise.resolve();
  private runError: HealthSyncError | null = null;
  private state: HealthSyncSnapshot;

  constructor(private readonly deps: SyncEngineDeps) {
    this.state = { status: null, isSyncing: false, ...this.persisted() };
  }

  private get store() {
    return this.deps.repo.health;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private deviceZone(): string {
    return this.deps.deviceZone?.() ?? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  }

  private log(message: string): void {
    this.deps.log?.(`[health-connect] ${message}`);
  }

  // ui state

  snapshot(): HealthSyncSnapshot {
    return this.state;
  }

  private persisted(): Omit<HealthSyncSnapshot, 'status' | 'isSyncing'> {
    const lastSuccess = this.store.getState('lastSuccessAt');
    return {
      enabled: this.deps.settings.get('healthSyncEnabled'),
      lastError: this.store.getJson<HealthSyncError>('lastError'),
      lastPullResult: this.store.getJson<PullResult>('lastPullResult'),
      lastSuccessAt: lastSuccess == null ? null : Number(lastSuccess),
      heldRemoteDeletions: this.store.heldRemoteDeletions(),
    };
  }

  private publish(partial: Partial<HealthSyncSnapshot> = {}): void {
    this.state = { ...this.state, ...this.persisted(), ...partial };
    this.deps.onStateChanged?.(this.state);
  }

  private error(code: HealthSyncErrorCode, extra: Partial<HealthSyncError> = {}): HealthSyncError {
    return { code, message: HEALTH_SYNC_ERROR_COPY[code], at: this.now(), ...extra };
  }

  // a run-level problem that does not stop the run (first one wins)
  private noteError(code: HealthSyncErrorCode, extra: Partial<HealthSyncError> = {}): void {
    this.runError ??= this.error(code, extra);
  }

  // single flight (4.3): one run at a time; requests during a run collapse
  // into one follow-up run of the highest requested kind

  sync(kind: SyncKind = 'full'): Promise<SyncRunResult> {
    if (this.queued) {
      if (RANK[kind] > RANK[this.queued.kind]) this.queued.kind = kind;
      return this.queued.promise;
    }
    if (this.running || this.exclusiveCount > 0) {
      let resolve!: (r: SyncRunResult) => void;
      const promise = new Promise<SyncRunResult>((r) => {
        resolve = r;
      });
      this.queued = { kind, promise, resolve };
      return promise;
    }
    return this.start(kind);
  }

  private start(kind: SyncKind): Promise<SyncRunResult> {
    const run = this.runOnce(kind).finally(() => {
      this.running = null;
      this.drainQueue();
    });
    this.running = run;
    return run;
  }

  private drainQueue(): void {
    if (this.running || this.exclusiveCount > 0 || !this.queued) return;
    const queued = this.queued;
    this.queued = null;
    void this.start(queued.kind).then(queued.resolve);
  }

  // archive import and other bulk local changes: wait for the current run,
  // block new runs while fn runs, then request a full sync (4.3)
  async runExclusive<T>(fn: () => T | Promise<T>): Promise<T> {
    this.exclusiveCount += 1;
    const previous = this.exclusiveTail;
    let release!: () => void;
    this.exclusiveTail = new Promise<void>((r) => {
      release = r;
    });
    try {
      await previous;
      if (this.running) await this.running;
      return await fn();
    } finally {
      this.exclusiveCount -= 1;
      release();
      this.drainQueue();
      if (this.exclusiveCount === 0) void this.sync('full');
    }
  }

  // resolves once no run is active or queued
  async idle(): Promise<void> {
    while (this.running || this.queued) {
      await (this.running ?? this.queued?.promise);
    }
  }

  private skipReason(): HealthSyncSkipReason | null {
    if (!this.deps.settings.get('healthSyncEnabled')) return 'off';
    if (this.deps.settings.get('isDemoDataActive')) return 'demo';
    return null;
  }

  private checkpoint(): void {
    if (this.skipReason()) throw new SyncAborted();
  }

  private async runOnce(kind: SyncKind): Promise<SyncRunResult> {
    const result: SyncRunResult = { kind, ran: false, skipped: this.skipReason(), pull: null, error: null };
    // demo active or sync off: no adapter call at all (4.4)
    if (result.skipped) return result;
    this.runError = null;
    let failure: HealthSyncError | null = null;
    let touchedLocal = false;
    let aborted = false;
    try {
      const status = await this.adapter.getStatus();
      this.publish({ status });
      this.checkpoint();
      if (status.availability === 'unsupported') return result;
      if (status.availability !== 'available') {
        failure = this.error(status.availability === 'providerUpdateRequired' ? 'updateRequired' : 'unavailable');
        return result;
      }
      if (!status.read && !status.write) {
        failure = this.error('permission');
        result.skipped = 'permission';
        return result;
      }
      await this.checkInstall();
      this.checkpoint();
      result.ran = true;
      touchedLocal = true;
      this.store.tx(() => {
        if (this.store.getState('firstGrantedAt') == null) this.store.setState('firstGrantedAt', String(this.now()));
        this.applyPayloadRevision();
      });

      const foreground = this.deps.isForeground();
      const wantsInbound = kind !== 'push' || this.store.getState('lastFullReadAt') == null;
      if (status.read && foreground && wantsInbound) {
        this.publish({ isSyncing: true });
        try {
          result.pull = await this.inbound(kind, status);
        } finally {
          this.publish({ isSyncing: false });
        }
        this.store.setJson('lastPullResult', result.pull);
      }
      if (status.write) await this.outbound(status, foreground);
      this.store.setState('lastSuccessAt', String(this.now()));
      failure = this.runError;
    } catch (error) {
      if (error instanceof SyncAborted) {
        aborted = true;
        result.skipped = this.skipReason();
        return result;
      }
      failure = (await this.classifyFailure(error)) ?? this.runError;
    } finally {
      if (!aborted) {
        // only real errors reach lastError; informational pulls stay in lastPullResult (defect 4)
        this.store.setJson('lastError', failure);
        result.error = failure;
      }
      this.publish();
      if (touchedLocal) this.deps.onLocalDataChanged?.();
    }
    return result;
  }

  private get adapter(): HealthConnectAdapter {
    return this.deps.adapter;
  }

  // an adapter failure that ended the run. null = transient, no error card
  private async classifyFailure(error: unknown): Promise<HealthSyncError | null> {
    const hc = toHealthConnectError(error);
    this.log(`run stopped: ${hc.code} ${hc.message}`);
    const detail = hc.message;
    switch (hc.code) {
      case 'E_HC_PERMISSION': {
        // hc interrupts reads when the app leaves the foreground; only a real
        // revoke is a permission error (2.3)
        const status = await this.adapter.getStatus().catch(() => null);
        if (status) this.publish({ status });
        if (status && (status.read || status.write)) return null;
        return this.error('permission', { detail });
      }
      case 'E_HC_RATE_LIMIT':
        return this.error('rateLimit', { detail });
      case 'E_HC_UNAVAILABLE':
        return this.error('unavailable', { detail });
      default:
        return this.error('remote', { detail });
    }
  }

  // device restore from android auto backup (4.6)
  private async checkInstall(): Promise<void> {
    const installId = await this.adapter.getInstallId();
    if (this.store.getState('installId') === installId) return;
    this.store.tx(() => {
      this.store.resetDeviceState(this.now());
      this.store.setState('installId', installId);
    });
    this.log('install id changed: device-bound sync state reset');
  }

  private applyPayloadRevision(): void {
    if (this.store.getState('payloadRevision') === String(HEALTH_PAYLOAD_REVISION)) return;
    this.store.markAllExportablePending(this.now());
    this.store.setState('payloadRevision', String(HEALTH_PAYLOAD_REVISION));
  }

  // inbound (2.3): changes pages update only the mirror and own learning;
  // reconcile runs once per pass over the committed mirror

  private async inbound(kind: SyncKind, status: HcStatus): Promise<PullResult> {
    if (kind === 'forceResync') {
      this.store.tx(() => {
        this.store.setState('changesToken', null);
        this.store.clearMirror();
      });
    }
    let token = this.store.getState('changesToken');
    let full = !token;
    let tokenRetried = false;
    while (token && !full) {
      let page;
      try {
        page = await this.adapter.getChanges(token);
      } catch (error) {
        // invalid token on providers that throw: silent full re-read, once (2.3)
        if (codeOf(error) === 'E_HC_TOKEN' && !tokenRetried) {
          tokenRetried = true;
          full = true;
          break;
        }
        throw error;
      }
      this.checkpoint();
      if (page.tokenExpired) {
        full = true;
        break;
      }
      const current = page;
      this.store.tx(() => {
        this.applyChangesPage(current.upserts, current.deletedRecordIds, status.packageName);
        // never store an empty token (2.11)
        if (current.nextToken) this.store.setState('changesToken', current.nextToken);
      });
      if (!page.hasMore || !page.nextToken) break;
      token = page.nextToken;
    }

    let rehydrated = 0;
    if (full) {
      this.store.tx(() => this.store.setState('changesToken', null));
      rehydrated = await this.fullRead(kind, status);
    }

    const nowMs = this.now();
    const plan = this.store.tx(() => {
      const p = planInbound({
        mirror: this.store.listMirror(),
        locals: this.store.localSnapshots(),
        tombstones: this.store.listTombstones(),
        mode: full ? 'full' : 'changes',
        historyGranted: status.history,
        nowMs,
        deviceZone: this.deviceZone(),
      });
      this.store.applyInboundPlan(p, nowMs);
      return p;
    });
    this.log(
      `inbound ${full ? 'full' : 'changes'}: ${plan.counts.recordCount} records, ${plan.counts.nightCount} nights, ` +
        `+${plan.counts.inserted} ~${plan.counts.updated} -${plan.deletes.length} rehydrated ${rehydrated}`
    );
    return buildPullResult({
      recordCount: plan.counts.recordCount,
      nightCount: plan.counts.nightCount,
      inserted: plan.counts.inserted,
      updated: plan.counts.updated,
      rehydrated,
      historyGranted: status.history,
    });
  }

  private applyChangesPage(upserts: readonly HealthRecord[], deletedRecordIds: readonly string[], ownPackage: string): void {
    const nowMs = this.now();
    for (const record of upserts) {
      if (isOwnRecord(record, ownPackage)) {
        // own upserts only teach ids and versions; never rehydrate (2.3)
        const sessionId = sessionIdFromClientRecordId(record.clientRecordId);
        if (sessionId) this.store.learnOwnRecord(sessionId, record, nowMs);
      } else {
        this.store.upsertMirror(record);
      }
    }
    for (const recordId of deletedRecordIds) {
      this.store.deleteMirror(recordId);
      const sessionId = this.store.sessionIdForRecordId(recordId);
      if (sessionId) this.store.applyRemoteOwnDeletion(sessionId, nowMs);
    }
  }

  private async readAll(origin: 'own' | 'all', startMs: number | null, endMs: number): Promise<HealthRecord[]> {
    const records: HealthRecord[] = [];
    let pageToken: string | null = null;
    do {
      const page = await this.adapter.readSleep({ origin, startMs, endMs, pageToken });
      records.push(...page.records);
      pageToken = page.nextPageToken || null;
    } while (pageToken);
    return records;
  }

  // token BEFORE the reads, so writes during pagination arrive as changes
  private async fullRead(kind: SyncKind, status: HcStatus): Promise<number> {
    const token = await this.adapter.getChangesToken();
    const endMs = this.now();
    const own = await this.readAll('own', null, endMs);
    this.checkpoint();
    const all = await this.readAll('all', null, endMs);
    this.checkpoint();
    const pkg = status.packageName;

    return this.store.tx(() => {
      const nowMs = this.now();
      this.store.replaceMirror(all.filter((r) => !isOwnRecord(r, pkg)));

      const ownBySession = new Map<string, HealthRecord>();
      for (const record of own) {
        if (!isOwnRecord(record, pkg)) continue;
        const sessionId = sessionIdFromClientRecordId(record.clientRecordId);
        if (!sessionId) continue;
        const previous = ownBySession.get(sessionId);
        if (!previous || previous.clientRecordVersion < record.clientRecordVersion) ownBySession.set(sessionId, record);
      }
      for (const [sessionId, record] of ownBySession) this.store.learnOwnRecord(sessionId, record, nowMs);

      // own record missing for a synced, written session -> remote-deletion
      // policy. only where own reads are unlimited (android 14+ or history)
      if (status.sdkInt >= 34 || status.history) {
        for (const row of this.store.listSessionRows()) {
          const out = toOutboundRow(row);
          if (!isOwnedForExport(out) || !out.hcWritten || out.needsSync || out.hcRemoteDeleted) continue;
          if (!ownBySession.has(row.id)) this.store.applyRemoteOwnDeletion(row.id, nowMs);
        }
      }

      const orphans = orphanedOwnRecords([...ownBySession.values()], {
        ownPackage: pkg,
        existingSessionIds: new Set(this.store.listSessionRows().map((r) => r.id)),
        deletedSessionIds: this.store.deletedSessionIds(),
      });
      for (const orphan of orphans) this.store.insertRehydrated(orphan, this.deviceZone(), nowMs);

      // force resync repairs differences instead of rewriting everything (2.5)
      if (kind === 'forceResync') {
        for (const row of this.store.exportableRows()) {
          const remote = ownBySession.get(row.id);
          if (needsRepair({ ...toOwnState(row), hcWritten: row.hc_written === 1 }, remote && toRemoteOwn(remote))) {
            this.store.bumpPending(row.id, nowMs, remote?.clientRecordVersion ?? 0);
          }
        }
      }

      if (token) this.store.setState('changesToken', token);
      this.store.setState('lastFullReadAt', String(nowMs));
      return orphans.length;
    });
  }

  // outbound (2.5, 2.6)

  private async outbound(status: HcStatus, foreground: boolean): Promise<void> {
    const nowMs = this.now();
    const first = planOutbound(this.store.listSessionRows().map(toOutboundRow));
    this.store.tx(() => {
      for (const id of first.invalidWritten) {
        const row = this.store.getSessionRow(id);
        if (row) this.store.enqueueDeletion(row, nowMs);
      }
    });
    await this.drainOutbox(status);
    this.checkpoint();

    // re-plan: local edits may have landed while the outbox drained
    const plan = planOutbound(this.store.listSessionRows().map(toOutboundRow));
    if (plan.zoneErrors.length > 0) this.noteError('missingZone', { sessionId: plan.zoneErrors[0] });
    let batches = chunk(plan.writes, WRITE_BATCH_SIZE);
    // background: at most one batch, the rest waits for the foreground (4.3)
    if (!foreground) batches = batches.slice(0, 1);
    for (const batch of batches) {
      await this.writeBatch(batch);
      this.checkpoint();
    }
  }

  private async writeBatch(batch: PlannedWrite[]): Promise<void> {
    const marked = new Set(this.store.markWritten(batch.map((w) => w.sessionId)));
    const writes = batch.filter((w) => marked.has(w.sessionId));
    if (writes.length === 0) return;

    const results = await this.upsert(writes);
    let stop: HealthConnectError | null = null;
    const invalid: PlannedWrite[] = [];
    this.store.tx(() => {
      results.forEach((r, i) => {
        const w = writes[i];
        if (r.ok) this.store.markSynced(w.sessionId, w.version, r.recordId);
        else if (r.code === 'E_HC_INVALID') invalid.push(w);
        else stop ??= new HealthConnectError(r.code, r.message);
      });
    });
    if (stop) throw stop;
    if (invalid.length === 0) return;

    // the whole hc transaction failed validation: find the bad record alone.
    // a mixed result means the module rejected exactly these records
    if (invalid.length === writes.length && writes.length > 1) {
      for (const w of invalid) {
        const [r] = await this.upsert([w]);
        if (r.ok) this.store.markSynced(w.sessionId, w.version, r.recordId);
        else if (r.code === 'E_HC_INVALID') this.poison(w);
        else throw new HealthConnectError(r.code, r.message);
      }
    } else {
      for (const w of invalid) this.poison(w);
    }
  }

  // a validation failure of the whole hc call counts against every write in it
  private async upsert(writes: PlannedWrite[]): Promise<HcWriteResult[]> {
    try {
      return await this.adapter.upsertSleep(writes.map((w) => w.write));
    } catch (error) {
      if (codeOf(error) !== 'E_HC_INVALID') throw error;
      const message = toHealthConnectError(error).message;
      return writes.map(() => ({ ok: false, code: 'E_HC_INVALID', message }));
    }
  }

  // skipped until its version changes (an edit), so one bad record is not
  // rewritten on every foreground (2.5)
  private poison(write: PlannedWrite): void {
    this.store.markPoisoned(write.sessionId, write.version);
    this.noteError('invalid', { sessionId: write.sessionId });
    this.log(`health connect rejected ${write.write.clientRecordId} v${write.version}`);
  }

  private confirmDeleted(row: OutboxRow): void {
    this.store.removeOutbox(row.client_record_id);
    if (this.store.getSessionRow(row.session_id)) this.store.clearWritten(row.session_id);
  }

  private async drainOutbox(status: HcStatus): Promise<void> {
    const rows = this.store.listOutbox();
    for (const group of chunk(rows, DELETE_BATCH_SIZE)) {
      try {
        await this.adapter.deleteSleepByClientRecordIds(group.map((r) => r.client_record_id));
        this.store.tx(() => group.forEach((r) => this.confirmDeleted(r)));
      } catch (error) {
        if (STOP_CODES.has(codeOf(error))) throw error;
        // all-or-nothing batch failed: one id at a time (2.6 rule 3)
        for (const row of group) await this.deleteOne(row, status);
      }
      this.checkpoint();
    }
    if (this.store.listOutbox().some((r) => r.attempts >= OUTBOX_ERROR_ATTEMPTS)) this.noteError('deleteFailed');
  }

  private async deleteOne(row: OutboxRow, status: HcStatus): Promise<void> {
    try {
      await this.adapter.deleteSleepByClientRecordIds([row.client_record_id]);
      this.store.tx(() => this.confirmDeleted(row));
      return;
    } catch (error) {
      const code = codeOf(error);
      if (STOP_CODES.has(code)) throw error;
      // android 14+ reads its own records with write permission only (2.11)
      const canReadOwn = status.read || (status.write && status.sdkInt >= 34);
      let stillInHealth = true;
      if (canReadOwn) {
        const records = await this.readAll('own', row.start_ms - DAY_MS, row.end_ms + DAY_MS);
        stillInHealth = records.some((r) => r.clientRecordId === row.client_record_id);
      }
      const action = outboxFailureAction({ attempts: row.attempts, canReadOwn, stillInHealth });
      this.store.tx(() => {
        if (action === 'drop') this.confirmDeleted(row);
        else this.store.recordOutboxFailure(row.client_record_id, code);
      });
      if (action === 'drop') this.log(`dropped outbox row ${row.client_record_id} (${stillInHealth ? 'gave up' : 'already gone'})`);
    }
  }

  // user actions

  // swift enableSync: request, enable only with a grant, then a full sync (2.8)
  async enableSync(): Promise<boolean> {
    let status = await this.adapter.getStatus();
    this.publish({ status });
    if (status.availability !== 'available') {
      this.store.setJson('lastError', this.error(status.availability === 'providerUpdateRequired' ? 'updateRequired' : 'unavailable'));
      this.publish();
      return false;
    }
    this.store.setState('permissionRequestedAt', String(this.now()));
    status = await this.adapter.requestPermissions({ history: status.historyFeatureAvailable });
    this.publish({ status });
    if (!status.read && !status.write) {
      this.store.setJson('lastError', this.error('permission'));
      this.publish();
      return false;
    }
    this.deps.settings.set('healthSyncEnabled', true);
    this.deps.onSettingsChanged?.();
    this.publish();
    await this.sync('full');
    return true;
  }

  // swift disableSync (4.7): keep links, tombstones, ledger, outbox and flags
  async disableSync(): Promise<void> {
    this.deps.settings.set('healthSyncEnabled', false);
    this.deps.onSettingsChanged?.();
    await this.idle();
    this.store.tx(() => {
      this.store.setState('changesToken', null);
      this.store.setState('lastFullReadAt', null);
      this.store.clearMirror();
      this.store.setJson('lastError', null);
    });
    this.publish();
  }

  async refreshStatus(): Promise<HcStatus> {
    const status = await this.adapter.getStatus();
    this.publish({ status });
    return status;
  }

  // held remote deletions card (2.6)
  keepHeldRemoteDeletions(): void {
    this.store.setHeldRemoteDeletions([]);
    this.publish();
  }

  removeHeldRemoteDeletions(): void {
    const ids = this.store.heldRemoteDeletions();
    this.store.tx(() => {
      for (const id of ids) this.deps.repo.deleteSession(id, this.now());
      this.store.setHeldRemoteDeletions([]);
    });
    this.deps.onLocalDataChanged?.();
    this.publish();
  }
}
