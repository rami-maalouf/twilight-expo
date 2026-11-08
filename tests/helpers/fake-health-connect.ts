// in-memory health connect that models the behaviors the sync design depends
// on (docs/health-connect.md 2.3-2.6, 2.11, 7.1):
// - upsert by clientRecordId; a lower version is ignored silently and returns
//   the existing id; an equal version replaces (android 16) or is ignored (docs)
// - insert and delete are all-or-nothing; deleting a missing id resolves
//   (android 16) or throws E_HC_REMOTE (docs)
// - a bad token returns tokenExpired (android 16) or throws E_HC_TOKEN
// - foreign reads trim silently to a window without history; own reads are
//   unlimited (android 14+) or limited too (android 13)
// - getChanges pages with hasMore and replays own changes
// - any call can throw a chosen error once; hooks run before every call
import type { HcStatus, HealthConnectAdapter, HcReadQuery, HcWrite, HcWriteResult } from '@/services/health-connect/adapter';
import { HealthConnectError, type HcErrorCode } from '@/services/health-connect/adapter';
import { HEALTH_CLIENT_RECORD_PREFIX, type HealthRecord, type HealthStage } from '@/domain/health/types';
import { isValidTimeZone, offsetSecondsAt } from '@/domain/health/zones';

export const OWN_PACKAGE = 'com.rami.twilight.port';

type Method = keyof HealthConnectAdapter;

type Change = { seq: number; kind: 'upsert'; record: HealthRecord } | { seq: number; kind: 'delete'; recordId: string };

export interface FakeOptions {
  equalVersionReplaces?: boolean;
  deleteMissingThrows?: boolean;
  badTokenThrows?: boolean;
  ownReadsLimited?: boolean;
}

export class FakeHealthConnect implements HealthConnectAdapter {
  availability: HcStatus['availability'] = 'available';
  read = true;
  write = true;
  history = true;
  historyFeatureAvailable = true;
  sdkInt = 36;
  installId = 'install-1';
  // foreign records starting before this are not readable without history
  windowStartMs: number | null = null;
  changesPageSize = 1000;
  readPageSize = 500;
  grantOnRequest: { read: boolean; write: boolean; history: boolean } = { read: true, write: true, history: true };

  readonly records = new Map<string, HealthRecord>();
  readonly calls: { method: Method; arg?: unknown }[] = [];
  private changes: Change[] = [];
  private seq = 0;
  private nextId = 0;
  private tokenGeneration = 0;
  private failures = new Map<Method, HealthConnectError[]>();
  beforeCall: ((method: Method, callIndex: number) => void) | null = null;
  clock: () => number = () => Date.now();

  constructor(readonly options: FakeOptions = {}) {}

  // test controls

  failOnce(method: Method, code: HcErrorCode, message = `${code} injected`): void {
    this.failures.set(method, [...(this.failures.get(method) ?? []), new HealthConnectError(code, message)]);
  }

  // every token issued so far now reports tokenExpired
  expireTokens(): void {
    this.tokenGeneration += 1;
  }

  callCount(method?: Method): number {
    return method ? this.calls.filter((c) => c.method === method).length : this.calls.length;
  }

  resetCalls(): void {
    this.calls.length = 0;
  }

  ownRecords(): HealthRecord[] {
    return [...this.records.values()].filter((r) => r.dataOrigin === OWN_PACKAGE);
  }

  ownRecord(sessionId: string): HealthRecord | undefined {
    return this.ownRecords().find((r) => r.clientRecordId === `${HEALTH_CLIENT_RECORD_PREFIX}${sessionId}`);
  }

  // another app writes (seeder equivalent); upsert by cid within that origin
  foreignUpsert(input: {
    origin: string;
    cid?: string | null;
    startMs: number;
    endMs: number;
    version?: number;
    stages?: HealthStage[];
    startOffsetSec?: number | null;
    endOffsetSec?: number | null;
  }): HealthRecord {
    const existing = input.cid
      ? [...this.records.values()].find((r) => r.dataOrigin === input.origin && r.clientRecordId === input.cid)
      : undefined;
    const record: HealthRecord = {
      recordId: existing?.recordId ?? this.newId(),
      dataOrigin: input.origin,
      clientRecordId: input.cid ?? null,
      clientRecordVersion: input.version ?? (existing ? existing.clientRecordVersion + 1 : 1),
      startMs: input.startMs,
      endMs: input.endMs,
      startOffsetSec: input.startOffsetSec === undefined ? 0 : input.startOffsetSec,
      endOffsetSec: input.endOffsetSec === undefined ? 0 : input.endOffsetSec,
      lastModifiedMs: this.clock(),
      recordingMethod: 'automaticallyRecorded',
      stages: input.stages ?? [{ startMs: input.startMs, endMs: input.endMs, type: 2 }],
    };
    this.put(record);
    return record;
  }

  // deletion by the record's own app, or by the user in the hc ui / auto-delete
  removeRecord(recordId: string): void {
    if (!this.records.delete(recordId)) throw new Error(`no record ${recordId}`);
    this.log({ kind: 'delete', recordId });
  }

  // a restore of another device's database brings no hc records along
  private put(record: HealthRecord): void {
    this.records.set(record.recordId, record);
    this.log({ kind: 'upsert', record: { ...record } });
  }

  private log(change: { kind: 'upsert'; record: HealthRecord } | { kind: 'delete'; recordId: string }): void {
    this.seq += 1;
    this.changes.push({ ...change, seq: this.seq });
  }

  private newId(): string {
    this.nextId += 1;
    return `hc-${this.nextId}`;
  }

  private enter(method: Method, arg?: unknown): void {
    this.beforeCall?.(method, this.calls.length);
    this.calls.push({ method, arg });
    const queue = this.failures.get(method);
    const failure = queue?.shift();
    if (failure) throw failure;
  }

  private requireRead(): void {
    if (!this.read) throw new HealthConnectError('E_HC_PERMISSION', 'Caller doesn\'t have android.permission.health.READ_SLEEP');
  }

  private requireWrite(): void {
    if (!this.write) throw new HealthConnectError('E_HC_PERMISSION', 'Caller doesn\'t have android.permission.health.WRITE_SLEEP');
  }

  private status(): HcStatus {
    return {
      availability: this.availability,
      read: this.read,
      write: this.write,
      history: this.history,
      historyFeatureAvailable: this.historyFeatureAvailable,
      packageName: OWN_PACKAGE,
      sdkInt: this.sdkInt,
    };
  }

  // adapter

  async getStatus(): Promise<HcStatus> {
    this.enter('getStatus');
    return this.status();
  }

  async getInstallId(): Promise<string> {
    this.enter('getInstallId');
    return this.installId;
  }

  async requestPermissions(options: { history: boolean }): Promise<HcStatus> {
    this.enter('requestPermissions', options);
    this.read = this.grantOnRequest.read;
    this.write = this.grantOnRequest.write;
    this.history = options.history && this.grantOnRequest.history && this.read;
    return this.status();
  }

  async openPermissionSettings(): Promise<void> {
    this.enter('openPermissionSettings');
  }

  async openProviderInstall(): Promise<void> {
    this.enter('openProviderInstall');
  }

  async getChangesToken(): Promise<string> {
    this.enter('getChangesToken');
    this.requireRead();
    return `g${this.tokenGeneration}-${this.seq}`;
  }

  async getChanges(token: string) {
    this.enter('getChanges', token);
    this.requireRead();
    const match = /^g(\d+)-(\d+)$/.exec(token);
    const from = match ? Number(match[2]) : NaN;
    if (!match || Number(match[1]) !== this.tokenGeneration || from > this.seq) {
      if (this.options.badTokenThrows && !match) throw new HealthConnectError('E_HC_TOKEN', 'invalid token');
      return { upserts: [], deletedRecordIds: [], nextToken: '', hasMore: false, tokenExpired: true };
    }
    const pending = this.changes.filter((c) => c.seq > from);
    const page = pending.slice(0, this.changesPageSize);
    const last = page.length > 0 ? page[page.length - 1].seq : from;
    return {
      upserts: page.flatMap((c) => (c.kind === 'upsert' && this.visible(c.record) ? [c.record] : [])),
      deletedRecordIds: page.flatMap((c) => (c.kind === 'delete' ? [c.recordId] : [])),
      nextToken: `g${this.tokenGeneration}-${last}`,
      hasMore: pending.length > page.length,
      tokenExpired: false,
    };
  }

  private visible(record: HealthRecord): boolean {
    const own = record.dataOrigin === OWN_PACKAGE;
    const limited = !own || this.options.ownReadsLimited;
    if (!limited || this.history || this.windowStartMs == null) return true;
    return record.startMs >= this.windowStartMs;
  }

  async readSleep(query: HcReadQuery) {
    this.enter('readSleep', query);
    const own = query.origin === 'own';
    // android 14+: own records are readable with write permission only (2.11)
    if (!(this.read || (own && this.write && this.sdkInt >= 34))) this.requireRead();
    const all = [...this.records.values()]
      .filter((r) => !own || r.dataOrigin === OWN_PACKAGE)
      .filter((r) => (query.startMs == null || r.endMs > query.startMs) && r.startMs < query.endMs)
      .filter((r) => this.visible(r))
      .sort((a, b) => a.startMs - b.startMs || a.recordId.localeCompare(b.recordId));
    const offset = query.pageToken ? Number(query.pageToken) : 0;
    const records = all.slice(offset, offset + this.readPageSize).map((r) => ({ ...r }));
    const next = offset + this.readPageSize;
    return { records, nextPageToken: next < all.length ? String(next) : null };
  }

  async upsertSleep(writes: HcWrite[]): Promise<HcWriteResult[]> {
    this.enter('upsertSleep', writes);
    this.requireWrite();
    const results: (HcWriteResult | null)[] = writes.map((w) =>
      !w.clientRecordId.startsWith(HEALTH_CLIENT_RECORD_PREFIX) || !isValidTimeZone(w.startZoneId) || !isValidTimeZone(w.endZoneId) || w.endMs <= w.startMs
        ? { ok: false, code: 'E_HC_INVALID', message: 'rejected by the module' }
        : null
    );
    // one hc transaction for the valid writes
    for (let i = 0; i < writes.length; i += 1) {
      if (results[i]) continue;
      const w = writes[i];
      const existing = this.ownRecords().find((r) => r.clientRecordId === w.clientRecordId);
      const ignored =
        existing != null &&
        (w.clientRecordVersion < existing.clientRecordVersion ||
          (w.clientRecordVersion === existing.clientRecordVersion && !this.options.equalVersionReplaces));
      if (existing && ignored) {
        results[i] = { ok: true, recordId: existing.recordId };
        continue;
      }
      const record: HealthRecord = {
        recordId: existing?.recordId ?? this.newId(),
        dataOrigin: OWN_PACKAGE,
        clientRecordId: w.clientRecordId,
        clientRecordVersion: w.clientRecordVersion,
        startMs: w.startMs,
        endMs: w.endMs,
        startOffsetSec: offsetSecondsAt(w.startZoneId, w.startMs),
        endOffsetSec: offsetSecondsAt(w.endZoneId, w.endMs),
        lastModifiedMs: this.clock(),
        recordingMethod: w.recordingMethod,
        stages: [{ startMs: w.startMs, endMs: w.endMs, type: 2 }],
      };
      this.put(record);
      results[i] = { ok: true, recordId: record.recordId };
    }
    return results as HcWriteResult[];
  }

  async deleteSleepByClientRecordIds(ids: string[]): Promise<void> {
    this.enter('deleteSleepByClientRecordIds', ids);
    this.requireWrite();
    const targets = ids.map((cid) => this.ownRecords().find((r) => r.clientRecordId === cid));
    if (this.options.deleteMissingThrows && targets.some((t) => !t)) {
      throw new HealthConnectError('E_HC_REMOTE', 'RemoteException: deleting by invalid identifiers');
    }
    for (const target of targets) if (target) this.removeRecord(target.recordId);
  }
}
