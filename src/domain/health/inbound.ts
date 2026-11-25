// one reconcile per inbound pass over the whole foreign mirror
// (docs/health-connect.md 2.3, 2.4, 2.6, 4.2). pure: mirror + locals +
// tombstones in, a plan out. running it twice on the same input is idempotent.
import { clusterNights } from './clusterer';
import { intervalsOverlap, reconcileNights, type ReconcileAction } from './reconciler';
import { AGED_OUT_MS, type LocalSessionSnapshot, type MirrorRecord, type SleepNight, type Tombstone } from './types';
import { offsetSecondsAt, zoneForOffset } from './zones';

export interface InboundInput {
  // foreign records only (own records never reach the mirror)
  mirror: readonly MirrorRecord[];
  locals: readonly LocalSessionSnapshot[];
  tombstones: readonly Tombstone[];
  // 'full' when this pass replaced the mirror from a full read; absence then
  // needs read evidence because range reads trim silently (2.4)
  mode: 'changes' | 'full';
  historyGranted: boolean;
  nowMs: number;
  deviceZone: string;
}

export interface PlannedNight {
  night: SleepNight;
  startZone: string;
  endZone: string;
}

export interface InboundPlan {
  actions: ReconcileAction[];
  inserts: PlannedNight[];
  // every matched import (relink); `changed` = start, end, key or zones moved
  updates: (PlannedNight & { sessionId: string; changed: boolean })[];
  deletes: { sessionId: string; reason: 'vanished' | 'merged' | 'superseded' }[];
  // imports kept without links: aged out, or absent without read evidence
  detaches: string[];
  counts: { recordCount: number; nightCount: number; inserted: number; updated: number };
}

// a zone counts as moved only when its offset at the instant differs: after
// travel the same offset maps to another iana id (Etc/GMT-2 for Europe/Paris),
// which must not rewrite every matched import on every pass
function zoneMoved(stored: string | null, planned: string, instantMs: number): boolean {
  if (stored === planned) return false;
  const before = stored == null ? null : offsetSecondsAt(stored, instantMs);
  return before == null || before !== offsetSecondsAt(planned, instantMs);
}

function plannedNight(night: SleepNight, deviceZone: string): PlannedNight {
  return {
    night,
    startZone: zoneForOffset(night.startOffsetSec, night.startMs, deviceZone),
    endZone: zoneForOffset(night.endOffsetSec, night.endMs, deviceZone),
  };
}

export function planInbound(input: InboundInput): InboundPlan {
  const tombstonedKeys = new Set(input.tombstones.map((t) => t.nightKey));
  const tombstonedRecords = new Set(input.tombstones.flatMap((t) => t.recordIds));
  const present = new Set(input.mirror.map((r) => r.recordId));
  // tombstoned record ids leave the snapshot before clustering, so a new
  // night a source merged with a deleted nap still imports (4.2 step 0)
  const nights = clusterNights(
    input.mirror.filter((r) => !tombstonedRecords.has(r.recordId)),
    { deviceZone: input.deviceZone }
  );

  const locals = input.locals.filter((s) => !s.isDemo);
  const hcImports = locals.filter((s) => s.imported && !s.adopted && s.provider === 'health_connect');

  // vanished candidates: linked here, none of the links left in health.
  // only imports that will really be deleted leave the overlap checks; an
  // aged-out import is detached before the reconcile, so it keeps blocking
  // overlapping foreign nights in this pass too (2.6 retention exception)
  const vanishing = new Set<string>();
  const detaches = new Set<string>();
  for (const s of hcImports) {
    if (s.linkedRecordIds.length === 0) continue;
    if (s.linkedRecordIds.some((id) => present.has(id))) continue;
    if (s.nightKey && tombstonedKeys.has(s.nightKey)) continue;
    const evidence =
      input.mode === 'changes' ||
      input.historyGranted ||
      input.mirror.some((r) => r.startMs <= s.startMs);
    // retention exception: auto-delete must not erase old imported history
    const agedOut = s.endMs != null && input.nowMs - s.endMs > AGED_OUT_MS;
    if (evidence && !agedOut) {
      vanishing.add(s.id);
    } else {
      // aged out, or absent without proof it was readable: keep the night,
      // drop the stale links so a later changes pass cannot treat it as vanished
      detaches.add(s.id);
    }
  }

  const { actions, merged } = reconcileNights(nights, locals, tombstonedKeys, { excludedFromOverlap: vanishing });

  const owned = locals.filter((s) => !s.imported);
  const inserts: PlannedNight[] = [];
  const updates: InboundPlan['updates'] = [];
  const deletes: InboundPlan['deletes'] = merged.map((m) => ({ sessionId: m.sessionId, reason: 'merged' as const }));
  const matched = new Set<string>();

  for (const action of actions) {
    if (action.type === 'insert') {
      inserts.push(plannedNight(action.night, input.deviceZone));
    } else if (action.type === 'updateImported') {
      matched.add(action.sessionId);
      const { night } = action;
      // user edits win: an import that now overlaps an owned session is
      // superseded; it comes back if the owned session is deleted (defect 9)
      if (owned.some((s) => intervalsOverlap(night.startMs, night.endMs, s.startMs, s.endMs))) {
        deletes.push({ sessionId: action.sessionId, reason: 'superseded' });
        continue;
      }
      const planned = plannedNight(night, input.deviceZone);
      const local = locals.find((s) => s.id === action.sessionId);
      const changed =
        !local ||
        local.startMs !== night.startMs ||
        local.endMs !== night.endMs ||
        local.nightKey !== night.nightKey ||
        (local.startZone !== undefined && zoneMoved(local.startZone, planned.startZone, night.startMs)) ||
        (local.endZone !== undefined && zoneMoved(local.endZone, planned.endZone, night.endMs));
      updates.push({ ...planned, sessionId: action.sessionId, changed });
    }
  }

  for (const id of vanishing) {
    if (!matched.has(id)) deletes.push({ sessionId: id, reason: 'vanished' });
  }
  for (const id of matched) detaches.delete(id);

  return {
    actions,
    inserts,
    updates,
    deletes,
    detaches: [...detaches],
    counts: {
      recordCount: input.mirror.length,
      // swift counts tombstoned nights too; count before the tombstone filter
      nightCount: tombstonedRecords.size > 0 ? clusterNights(input.mirror, { deviceZone: input.deviceZone }).length : nights.length,
      inserted: inserts.length,
      updated: updates.filter((u) => u.changed).length,
    },
  };
}
