// ports: Twilight/Utils/HealthKitSleepReconciler.swift
// port rules beyond swift: record-id matching with merge and split, skipAdopted,
// vanished imports excluded from overlap checks (docs/health-connect.md 4.2)
import type { LocalSessionSnapshot, SleepNight } from './types';

export type ReconcileAction =
  | { type: 'skipTombstoned'; nightKey: string }
  | { type: 'updateImported'; sessionId: string; night: SleepNight }
  | { type: 'skipAdopted'; nightKey: string; sessionId: string }
  | { type: 'skipOverlapsTwilightOwned'; nightKey: string; sessionId: string }
  // existingSessionId carries the kept night's key for in-batch skips (swift)
  | { type: 'skipOverlapsImported'; nightKey: string; existingSessionId: string }
  | { type: 'insert'; night: SleepNight };

export interface ReconcileResult {
  // one action per night, nights sorted by start ascending
  actions: ReconcileAction[];
  // imports whose records now all sit inside a night another import follows
  merged: { sessionId: string; intoSessionId: string }[];
}

export interface ReconcileOptions {
  // imports about to vanish: not used for overlap checks (4.2)
  excludedFromOverlap?: ReadonlySet<string>;
}

// swift: nightStart < (sessionEnd ?? distantFuture) && sessionStart < nightEnd
export function intervalsOverlap(aStart: number, aEnd: number | null, bStart: number, bEnd: number | null): boolean {
  return aStart < (bEnd ?? Infinity) && bStart < (aEnd ?? Infinity);
}

function sortNights(nights: readonly SleepNight[]): SleepNight[] {
  return [...nights].sort((a, b) => a.startMs - b.startMs || a.endMs - b.endMs || a.nightKey.localeCompare(b.nightKey));
}

function isHealthConnectImport(s: LocalSessionSnapshot): boolean {
  return s.imported && !s.adopted && s.provider === 'health_connect';
}

export function reconcileNights(
  nights: readonly SleepNight[],
  localSessions: readonly LocalSessionSnapshot[],
  tombstonedNightKeys: ReadonlySet<string>,
  options: ReconcileOptions = {}
): ReconcileResult {
  const sorted = sortNights(nights);
  // demo sessions never block, supersede or match anything (4.4)
  const locals = localSessions.filter((s) => !s.isDemo);
  const imports = locals.filter(isHealthConnectImport);
  const adopted = locals.filter((s) => s.adopted);
  const owned = locals.filter((s) => !s.imported);
  const excluded = options.excludedFromOverlap ?? new Set<string>();
  const live = sorted.filter((n) => !tombstonedNightKeys.has(n.nightKey));
  const recordSets = new Map(live.map((n) => [n, new Set(n.recordIds)]));

  // phase a: each import follows the night that holds most of its records
  // (ties: earliest night), so a split keeps the import on its larger part
  const shared = (s: LocalSessionSnapshot, n: SleepNight) =>
    s.linkedRecordIds.reduce((count, id) => count + (recordSets.get(n)!.has(id) ? 1 : 0), 0);
  const claimants = new Map<SleepNight, { session: LocalSessionSnapshot; count: number }[]>();
  for (const session of imports) {
    let best: SleepNight | null = null;
    let bestCount = 0;
    for (const night of live) {
      const count = shared(session, night);
      if (count > bestCount) {
        best = night;
        bestCount = count;
      }
    }
    if (best) claimants.set(best, [...(claimants.get(best) ?? []), { session, count: bestCount }]);
  }

  const winners = new Map<SleepNight, LocalSessionSnapshot>();
  const claimed = new Set<string>();
  const merged: ReconcileResult['merged'] = [];
  for (const night of live) {
    const list = (claimants.get(night) ?? []).sort(
      (a, b) => b.count - a.count || a.session.startMs - b.session.startMs
    );
    if (list.length === 0) continue;
    const [winner, ...others] = list;
    winners.set(night, winner.session);
    claimed.add(winner.session.id);
    for (const { session } of others) {
      // merged only when every record it still has in health is in this night
      const elsewhere = session.linkedRecordIds.some((id) =>
        live.some((n) => n !== night && recordSets.get(n)!.has(id))
      );
      if (!elsewhere) {
        merged.push({ sessionId: session.id, intoSessionId: winner.session.id });
        claimed.add(session.id);
      }
    }
  }
  // swift rule as the fallback: an import with the same night key
  // (also re-links detached and archive-restored imports)
  for (const night of live) {
    if (winners.has(night)) continue;
    const byKey = imports.find((s) => !claimed.has(s.id) && s.nightKey === night.nightKey);
    if (byKey) {
      winners.set(night, byKey);
      claimed.add(byKey.id);
    }
  }

  // phase b: overlap rules against the post-update intervals
  const mergedIds = new Set(merged.map((m) => m.sessionId));
  const updatedInterval = new Map<string, SleepNight>();
  for (const [night, session] of winners) updatedInterval.set(session.id, night);
  const importIntervals = locals
    .filter(
      (s) => s.imported && !s.adopted && !mergedIds.has(s.id) && (updatedInterval.has(s.id) || !excluded.has(s.id))
    )
    .map((s) => {
      const night = updatedInterval.get(s.id);
      return { id: s.id, startMs: night?.startMs ?? s.startMs, endMs: night ? night.endMs : s.endMs };
    });

  const acceptedInserts: SleepNight[] = [];
  const actions: ReconcileAction[] = sorted.map((night): ReconcileAction => {
    if (tombstonedNightKeys.has(night.nightKey)) return { type: 'skipTombstoned', nightKey: night.nightKey };

    const winner = winners.get(night);
    if (winner) return { type: 'updateImported', sessionId: winner.id, night };

    const records = recordSets.get(night)!;
    const adoptedMatch = adopted.find(
      (s) => s.nightKey === night.nightKey || s.linkedRecordIds.some((id) => records.has(id))
    );
    if (adoptedMatch) return { type: 'skipAdopted', nightKey: night.nightKey, sessionId: adoptedMatch.id };

    const ownedOverlap = owned.find((s) => intervalsOverlap(night.startMs, night.endMs, s.startMs, s.endMs));
    if (ownedOverlap) {
      return { type: 'skipOverlapsTwilightOwned', nightKey: night.nightKey, sessionId: ownedOverlap.id };
    }

    const importOverlap = importIntervals.find((s) => intervalsOverlap(night.startMs, night.endMs, s.startMs, s.endMs));
    if (importOverlap) {
      return { type: 'skipOverlapsImported', nightKey: night.nightKey, existingSessionId: importOverlap.id };
    }

    const kept = acceptedInserts.find((n) => intervalsOverlap(night.startMs, night.endMs, n.startMs, n.endMs));
    if (kept) return { type: 'skipOverlapsImported', nightKey: night.nightKey, existingSessionId: kept.nightKey };
    acceptedInserts.push(night);
    return { type: 'insert', night };
  });

  return { actions, merged };
}

// swift reconcile(night:localSessions:tombstonedNightKeys:)
export function reconcileNight(
  night: SleepNight,
  localSessions: readonly LocalSessionSnapshot[],
  tombstonedNightKeys: ReadonlySet<string>
): ReconcileAction {
  return reconcileNights([night], localSessions, tombstonedNightKeys).actions[0];
}

export type DeletionAction = { type: 'ignore' } | { type: 'deleteImportedSession'; sessionId: string };

// swift deletionAction (tested there, never wired). the port keeps the
// classification: own-record deletions never delete a local session; they
// go through the remote-deletion policy instead (2.6)
export function deletionAction(input: {
  deletedRecordIds: ReadonlySet<string>;
  recordIdsBySessionId: ReadonlyMap<string, ReadonlySet<string>>;
  importedSessionIds: ReadonlySet<string>;
  ownRecordIds: ReadonlySet<string>;
}): DeletionAction[] {
  const foreign = [...input.deletedRecordIds].filter((id) => !input.ownRecordIds.has(id));
  if (foreign.length === 0) return [{ type: 'ignore' }];
  const actions: DeletionAction[] = [];
  for (const [sessionId, ids] of input.recordIdsBySessionId) {
    if (!input.importedSessionIds.has(sessionId)) continue;
    if (foreign.some((id) => ids.has(id))) actions.push({ type: 'deleteImportedSession', sessionId });
  }
  return actions.length > 0 ? actions : [{ type: 'ignore' }];
}
