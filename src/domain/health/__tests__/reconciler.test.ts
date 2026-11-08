// ports: twilightTests/HealthKitSleepSyncTests.swift (HealthKitSleepReconcilerTests)
// plus the port's inbound rules (docs/health-connect.md 4.2, 7.1)
import { STAGE_TYPE } from '../clusterer';
import { planInbound, type InboundInput } from '../inbound';
import { deletionAction, reconcileNight, reconcileNights } from '../reconciler';
import type { LocalSessionSnapshot, MirrorRecord, SleepNight } from '../types';

const WATCH = 'com.apple.health.watch';
const AUTOSLEEP = 'com.tantsissa.AutoSleep';
const H = 3600_000;
const DAY = 24 * H;
const BASE = 1_776_000_000_000;

function makeNight(startOffsetMs: number, durationMs: number, source = WATCH, recordIds = [`${source}-${startOffsetMs}`]): SleepNight {
  const startMs = BASE + startOffsetMs;
  return {
    nightKey: `${source}|test|${Math.floor(startMs / 1000)}`,
    source,
    startMs,
    endMs: startMs + durationMs,
    startOffsetSec: 0,
    endOffsetSec: 0,
    recordIds,
  };
}

function local(id: string, startMs: number, endMs: number | null, opts: Partial<LocalSessionSnapshot> = {}): LocalSessionSnapshot {
  return {
    id,
    startMs,
    endMs,
    imported: false,
    adopted: false,
    detached: false,
    provider: null,
    nightKey: null,
    linkedRecordIds: [],
    isDemo: false,
    ...opts,
  };
}

const imported = (id: string, night: SleepNight, opts: Partial<LocalSessionSnapshot> = {}) =>
  local(id, night.startMs, night.endMs, {
    imported: true,
    provider: 'health_connect',
    nightKey: night.nightKey,
    ...opts,
  });

describe('reconciler (swift ports)', () => {
  test('testSkipsTombstonedNight', () => {
    const night = makeNight(0, 7 * H);
    expect(reconcileNight(night, [], new Set([night.nightKey]))).toEqual({ type: 'skipTombstoned', nightKey: night.nightKey });
  });

  test('testSkipsOverlapWithTwilightOwnedSession', () => {
    const night = makeNight(0, 7 * H);
    const owned = local('local-1', night.startMs + 30 * 60_000, night.endMs - 30 * 60_000);
    expect(reconcileNight(night, [owned], new Set())).toEqual({
      type: 'skipOverlapsTwilightOwned',
      nightKey: night.nightKey,
      sessionId: 'local-1',
    });
  });

  test('testUpdatesImportedNight', () => {
    const night = makeNight(0, 8 * H);
    const imp = imported('imported-1', night, { endMs: night.endMs - H });
    expect(reconcileNight(night, [imp], new Set())).toEqual({ type: 'updateImported', sessionId: 'imported-1', night });
  });

  test('testInsertsWhenNoLocalMatch', () => {
    const night = makeNight(0, 7 * H);
    expect(reconcileNight(night, [], new Set())).toEqual({ type: 'insert', night });
  });

  test('testSkipsOverlapWithExistingImportedSession', () => {
    const existing = makeNight(0, 7 * H, WATCH);
    const overlapping = makeNight(30 * 60_000, 7 * H, AUTOSLEEP);
    expect(reconcileNight(overlapping, [imported('imported-1', existing)], new Set())).toEqual({
      type: 'skipOverlapsImported',
      nightKey: overlapping.nightKey,
      existingSessionId: 'imported-1',
    });
  });

  test('testBatchUpdatesMatchingImportedAndSkipsOverlappingForeign', () => {
    const existing = makeNight(0, 7 * H, WATCH);
    const overlapping = makeNight(30 * 60_000, 7 * H, AUTOSLEEP);
    const { actions } = reconcileNights([overlapping, existing], [imported('imported-1', existing)], new Set());
    expect(actions).toEqual([
      { type: 'updateImported', sessionId: 'imported-1', night: existing },
      { type: 'skipOverlapsImported', nightKey: overlapping.nightKey, existingSessionId: 'imported-1' },
    ]);
  });

  test('testBatchSkipsLaterOverlappingForeignInsert', () => {
    const earlier = makeNight(0, 7 * H, WATCH);
    const later = makeNight(45 * 60_000, 6 * H, AUTOSLEEP);
    const { actions } = reconcileNights([later, earlier], [], new Set());
    expect(actions).toEqual([
      { type: 'insert', night: earlier },
      { type: 'skipOverlapsImported', nightKey: later.nightKey, existingSessionId: earlier.nightKey },
    ]);
  });

  test('testDeletionIgnoresTwilightAuthoredSamples', () => {
    const deleted = new Set(['own-1']);
    expect(
      deletionAction({
        deletedRecordIds: deleted,
        recordIdsBySessionId: new Map([['imported-1', deleted]]),
        importedSessionIds: new Set(['imported-1']),
        ownRecordIds: deleted,
      })
    ).toEqual([{ type: 'ignore' }]);
  });

  test('testDeletionRemovesImportedSessionForForeignSamples', () => {
    expect(
      deletionAction({
        deletedRecordIds: new Set(['f-1']),
        recordIdsBySessionId: new Map([['imported-1', new Set(['f-1'])]]),
        importedSessionIds: new Set(['imported-1']),
        ownRecordIds: new Set(),
      })
    ).toEqual([{ type: 'deleteImportedSession', sessionId: 'imported-1' }]);
  });
});

describe('reconciler port rules', () => {
  test('updates by record id when the night key changed (source moved the start)', () => {
    const night = makeNight(20 * 60_000, 7 * H, WATCH, ['a', 'b']);
    const imp = imported('imp', makeNight(0, 7 * H, WATCH, ['a', 'b']), { linkedRecordIds: ['a', 'b'] });
    expect(reconcileNight(night, [imp], new Set())).toEqual({ type: 'updateImported', sessionId: 'imp', night });
  });

  test('merge: the import sharing most records is updated, the other is mergedInto', () => {
    const night = makeNight(0, 9 * H, WATCH, ['nap', 'n1', 'n2']);
    const big = imported('big', makeNight(H, 8 * H, WATCH, ['n1', 'n2']), { linkedRecordIds: ['n1', 'n2'] });
    const nap = imported('nap', makeNight(0, 30 * 60_000, WATCH, ['nap']), { linkedRecordIds: ['nap'] });
    const result = reconcileNights([night], [nap, big], new Set());
    expect(result.actions).toEqual([{ type: 'updateImported', sessionId: 'big', night }]);
    expect(result.merged).toEqual([{ sessionId: 'nap', intoSessionId: 'big' }]);
  });

  test('split: the import follows the part holding most records, the other part is inserted', () => {
    const small = makeNight(0, H, WATCH, ['a']);
    const large = makeNight(5 * H, 4 * H, WATCH, ['b', 'c']);
    const imp = imported('imp', makeNight(0, 9 * H, WATCH, ['a', 'b', 'c']), { linkedRecordIds: ['a', 'b', 'c'] });
    const { actions } = reconcileNights([small, large], [imp], new Set());
    expect(actions).toEqual([
      { type: 'insert', night: small },
      { type: 'updateImported', sessionId: 'imp', night: large },
    ]);
  });

  test('skipAdopted: the source moves an adopted night so it no longer overlaps -> no new import', () => {
    const moved = makeNight(12 * H, 7 * H, WATCH, ['a']);
    const adopted = local('adopted', BASE, BASE + 7 * H, { adopted: true, nightKey: 'old-key', linkedRecordIds: ['a'] });
    expect(reconcileNight(moved, [adopted], new Set())).toEqual({ type: 'skipAdopted', nightKey: moved.nightKey, sessionId: 'adopted' });
  });

  test('adopted sessions count as owned for overlap', () => {
    const night = makeNight(0, 7 * H, AUTOSLEEP, ['x']);
    const adopted = local('adopted', BASE + H, BASE + 6 * H, { adopted: true, nightKey: 'k' });
    expect(reconcileNight(night, [adopted], new Set()).type).toBe('skipOverlapsTwilightOwned');
  });

  test('the active session blocks with an open end', () => {
    const night = makeNight(2 * H, 7 * H);
    expect(reconcileNight(night, [local('active', BASE, null)], new Set()).type).toBe('skipOverlapsTwilightOwned');
  });

  test('demo sessions never block a real import', () => {
    const night = makeNight(0, 7 * H);
    expect(reconcileNight(night, [local('rami-demo-session-1', BASE, BASE + 7 * H, { isDemo: true })], new Set()).type).toBe('insert');
  });

  test('healthkit imports block overlaps but are never updated by health connect', () => {
    const night = makeNight(0, 7 * H);
    const hk = local('hk', BASE, BASE + 7 * H, { imported: true, provider: 'healthkit', nightKey: night.nightKey });
    expect(reconcileNight(night, [hk], new Set())).toEqual({ type: 'skipOverlapsImported', nightKey: night.nightKey, existingSessionId: 'hk' });
  });
});

// inbound plan over a mirror (clustering included)
let seq = 0;
function mirrorRecord(startMs: number, endMs: number, opts: Partial<MirrorRecord> = {}): MirrorRecord {
  seq += 1;
  return {
    recordId: opts.recordId ?? `m${seq}`,
    dataOrigin: opts.dataOrigin ?? WATCH,
    clientRecordId: null,
    startMs,
    endMs,
    startOffsetSec: 0,
    endOffsetSec: 0,
    lastModifiedMs: 0,
    stages: opts.stages ?? [],
    ...opts,
  };
}

function input(over: Partial<InboundInput>): InboundInput {
  return {
    mirror: [],
    locals: [],
    tombstones: [],
    mode: 'changes',
    historyGranted: true,
    nowMs: BASE + 2 * DAY,
    deviceZone: 'UTC',
    ...over,
  };
}

function importFor(id: string, plan: ReturnType<typeof planInbound>['inserts'][number], opts: Partial<LocalSessionSnapshot> = {}) {
  return local(id, plan.night.startMs, plan.night.endMs, {
    imported: true,
    provider: 'health_connect',
    nightKey: plan.night.nightKey,
    linkedRecordIds: plan.night.recordIds,
    startZone: plan.startZone,
    endZone: plan.endZone,
    ...opts,
  });
}

describe('planInbound', () => {
  test('re-running on the same input is idempotent: second pass updates nothing', () => {
    const mirror = [mirrorRecord(BASE, BASE + 7 * H, { recordId: 'a' })];
    const first = planInbound(input({ mirror }));
    expect(first.inserts).toHaveLength(1);
    const second = planInbound(input({ mirror, locals: [importFor('imp', first.inserts[0])] }));
    expect(second.inserts).toHaveLength(0);
    expect(second.updates).toEqual([expect.objectContaining({ sessionId: 'imp', changed: false })]);
    expect(second.counts.updated).toBe(0);
    expect(second.deletes).toHaveLength(0);
  });

  test('tombstoned record ids are removed before clustering: a night merged with a deleted nap still imports', () => {
    const nap = mirrorRecord(BASE, BASE + H, { recordId: 'nap' });
    const night = mirrorRecord(BASE + 2 * H, BASE + 9 * H, { recordId: 'night' });
    const plan = planInbound(
      input({ mirror: [nap, night], tombstones: [{ nightKey: 'old-nap-key', deletedAt: BASE, recordIds: ['nap'] }] })
    );
    expect(plan.inserts).toHaveLength(1);
    expect(plan.inserts[0].night.recordIds).toEqual(['night']);
    expect(plan.inserts[0].night.startMs).toBe(BASE + 2 * H);
  });

  test('other-source copies tombstoned with a deleted import do not come back', () => {
    const a = mirrorRecord(BASE, BASE + 7 * H, { recordId: 'a', dataOrigin: WATCH });
    const b = mirrorRecord(BASE + 10 * 60_000, BASE + 7 * H, { recordId: 'b', dataOrigin: AUTOSLEEP });
    const plan = planInbound(input({ mirror: [a, b], tombstones: [{ nightKey: 'k', deletedAt: BASE, recordIds: ['a', 'b'] }] }));
    expect(plan.inserts).toHaveLength(0);
  });

  test('superseded: a manual log over an imported night removes the import; deleting the log brings it back', () => {
    const mirror = [mirrorRecord(BASE, BASE + 7 * H, { recordId: 'a' })];
    const first = planInbound(input({ mirror }));
    const imp = importFor('imp', first.inserts[0]);
    const log = local('log', BASE + H, BASE + 8 * H);
    const withLog = planInbound(input({ mirror, locals: [imp, log] }));
    expect(withLog.deletes).toEqual([{ sessionId: 'imp', reason: 'superseded' }]);
    expect(withLog.inserts).toHaveLength(0);
    const afterLogDeleted = planInbound(input({ mirror, locals: [] }));
    expect(afterLogDeleted.inserts).toHaveLength(1);
  });

  test('vanished: linked and absent in a changes pass -> deleted', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    expect(planInbound(input({ locals: [imp] })).deletes).toEqual([{ sessionId: 'imp', reason: 'vanished' }]);
  });

  test('vanished: no links (archive restore) -> kept', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k' });
    const plan = planInbound(input({ locals: [imp], mode: 'full', historyGranted: false }));
    expect(plan.deletes).toHaveLength(0);
    expect(plan.detaches).toHaveLength(0);
  });

  test('vanished: absent in a full read without evidence -> kept and detached (links dropped)', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    const newer = mirrorRecord(BASE + DAY, BASE + DAY + 7 * H, { recordId: 'newer' });
    const plan = planInbound(input({ locals: [imp], mirror: [newer], mode: 'full', historyGranted: false }));
    expect(plan.deletes).toHaveLength(0);
    expect(plan.detaches).toEqual(['imp']);
  });

  test('vanished: absent in a full read with an older foreign record as evidence -> deleted', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    const older = mirrorRecord(BASE - 3 * DAY, BASE - 3 * DAY + 7 * H, { recordId: 'older' });
    const plan = planInbound(input({ locals: [imp], mirror: [older], mode: 'full', historyGranted: false }));
    expect(plan.deletes).toEqual([{ sessionId: 'imp', reason: 'vanished' }]);
  });

  test('vanished: history permission is evidence', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    expect(planInbound(input({ locals: [imp], mode: 'full', historyGranted: true })).deletes).toHaveLength(1);
  });

  test('vanished: tombstoned key -> kept', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    const plan = planInbound(input({ locals: [imp], tombstones: [{ nightKey: 'k', deletedAt: BASE, recordIds: [] }] }));
    expect(plan.deletes).toHaveLength(0);
  });

  test('vanished: ended more than 30 days ago -> detached, not deleted', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    const plan = planInbound(input({ locals: [imp], nowMs: BASE + 40 * DAY }));
    expect(plan.deletes).toHaveLength(0);
    expect(plan.detaches).toEqual(['imp']);
  });

  test('vanished imports are excluded from overlap checks: the second source imports in the same pass', () => {
    const imp = local('imp', BASE, BASE + 7 * H, { imported: true, provider: 'health_connect', nightKey: 'k', linkedRecordIds: ['gone'] });
    const other = mirrorRecord(BASE + 10 * 60_000, BASE + 7 * H, { recordId: 'b', dataOrigin: AUTOSLEEP });
    const plan = planInbound(input({ locals: [imp], mirror: [other] }));
    expect(plan.deletes).toEqual([{ sessionId: 'imp', reason: 'vanished' }]);
    expect(plan.inserts.map((i) => i.night.recordIds)).toEqual([['b']]);
  });

  test('overlapping foreign sources: one import (earliest start); the kept app deletes -> the other imports', () => {
    const a = mirrorRecord(BASE, BASE + 7 * H, { recordId: 'a', dataOrigin: WATCH });
    const b = mirrorRecord(BASE + 20 * 60_000, BASE + 7 * H, { recordId: 'b', dataOrigin: AUTOSLEEP });
    const first = planInbound(input({ mirror: [a, b] }));
    expect(first.inserts.map((i) => i.night.recordIds)).toEqual([['a']]);
    const imp = importFor('imp', first.inserts[0]);
    const second = planInbound(input({ mirror: [b], locals: [imp] }));
    expect(second.deletes).toEqual([{ sessionId: 'imp', reason: 'vanished' }]);
    expect(second.inserts.map((i) => i.night.recordIds)).toEqual([['b']]);
  });

  test('delete and re-insert of a night (new record id, same start) keeps the session id', () => {
    const before = [mirrorRecord(BASE, BASE + 7 * H, { recordId: 'old' })];
    const imp = importFor('imp', planInbound(input({ mirror: before })).inserts[0]);
    const after = [mirrorRecord(BASE, BASE + 7 * H, { recordId: 'new' })];
    const plan = planInbound(input({ mirror: after, locals: [imp] }));
    expect(plan.deletes).toHaveLength(0);
    expect(plan.inserts).toHaveLength(0);
    expect(plan.updates).toEqual([expect.objectContaining({ sessionId: 'imp' })]);
    expect(plan.updates[0].night.recordIds).toEqual(['new']);
  });

  test('a detached import re-links when a mirror night matches its key', () => {
    const mirror = [mirrorRecord(BASE, BASE + 7 * H, { recordId: 'a' })];
    const planned = planInbound(input({ mirror })).inserts[0];
    const detached = importFor('imp', planned, { linkedRecordIds: [], detached: true });
    const plan = planInbound(input({ mirror, locals: [detached] }));
    expect(plan.updates).toEqual([expect.objectContaining({ sessionId: 'imp' })]);
    expect(plan.detaches).toHaveLength(0);
  });

  test('zones come from offsets: +05:30 maps to Asia/Kolkata with the device in Paris', () => {
    const mirror = [mirrorRecord(BASE, BASE + 7 * H, { startOffsetSec: 19800, endOffsetSec: 19800, stages: [{ startMs: BASE, endMs: BASE + 7 * H, type: STAGE_TYPE.DEEP }] })];
    const plan = planInbound(input({ mirror, deviceZone: 'Europe/Paris' }));
    expect([plan.inserts[0].startZone, plan.inserts[0].endZone]).toEqual(['Asia/Kolkata', 'Asia/Kolkata']);
  });

  test('counts: changed updates only', () => {
    const mirror = [mirrorRecord(BASE, BASE + 8 * H, { recordId: 'a' })];
    const planned = planInbound(input({ mirror: [mirrorRecord(BASE, BASE + 7 * H, { recordId: 'a' })] })).inserts[0];
    const plan = planInbound(input({ mirror, locals: [importFor('imp', planned)] }));
    expect(plan.counts).toEqual({ recordCount: 1, nightCount: 1, inserted: 0, updated: 1 });
  });
});
